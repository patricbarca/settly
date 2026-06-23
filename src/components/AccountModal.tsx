import { useState, useMemo, type ChangeEvent } from "react";
import type { PayType, PayMethod } from "../lib/types";
import { useUser, setProfileName, setProfileAvatar, deleteAccount } from "../lib/auth";
import { useGroups, updateMyMember } from "../lib/store";
import { fileToAvatarDataUrl } from "../lib/image";
import { personColor, memberInitials } from "../lib/format";
import { enablePush, disablePush, isPushEnabled, pushSupported } from "../lib/push";
import { memberPays } from "../lib/pay";
import { countryList, dialCode, isValidPhone, normalizePhone } from "../lib/countries";
import { useT, useLang } from "../lib/i18n";
import { usePlan, FREE_AI_QUOTA } from "../lib/plan";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";
import { FeedbackModal } from "./FeedbackModal";

const PAY_TYPES: PayType[] = ["payid", "bank", "paypal", "revolut", "wise", "bizum", "bunq", "other"];

export function AccountModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const user = useUser();
  const groups = useGroups();
  const plan = usePlan();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const myMember = groups.map((g) => g.members.find((m) => m.id === g.meId)).find(Boolean);

  const lang = useLang();
  const countries = useMemo(() => countryList(lang), [lang]);
  const [name, setName] = useState(user?.name ?? "");
  const [inits, setInits] = useState(myMember?.initials ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [country, setCountry] = useState(myMember?.country ?? "");
  const [phone, setPhone] = useState(myMember?.phone ?? "");
  const phoneOk = !phone.trim() || isValidPhone(phone, country || undefined);
  // Un borrador por tipo, para que cada método se guarde por separado y no se
  // "contagien" valores al cambiar de tipo.
  type PayDraft = Record<string, { value: string; value2?: string }>;
  const initialPayDraft: PayDraft = {};
  for (const p of memberPays(myMember)) initialPayDraft[p.type] = { value: p.value, value2: p.value2 };
  const [payType, setPayType] = useState<PayType>(memberPays(myMember)[0]?.type ?? "payid");
  const [payDraft, setPayDraft] = useState<PayDraft>(initialPayDraft);
  const cur = payDraft[payType] ?? { value: "", value2: "" };
  const setCur = (patch: { value?: string; value2?: string }) => {
    setSaved(false);
    setPayDraft((d) => {
      const prev = d[payType] ?? { value: "" };
      return { ...d, [payType]: { ...prev, ...patch } };
    });
  };
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushOn, setPushOn] = useState(isPushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [delConfirm, setDelConfirm] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  async function onDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    setDelBusy(true);
    try {
      await deleteAccount(); // cierra sesión → la app vuelve al login
    } catch {
      setDelBusy(false);
      alert(t("account.deleteError"));
    }
  }

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMsg("");
    if (pushOn) {
      await disablePush();
      setPushOn(false);
    } else {
      const r = await enablePush();
      if (r === "ok") setPushOn(true);
      else if (r === "denied") setPushMsg(t("account.notifDenied"));
      else if (r === "unsupported") setPushMsg(t("account.notifUnsupported"));
      else setPushMsg(t("account.notifError"));
    }
    setPushBusy(false);
  }

  if (!user) return null;

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await fileToAvatarDataUrl(file));
      setSaved(false);
    } catch {
      /* imagen no válida */
    }
  }

  async function save() {
    if (saving || !phoneOk) return;
    setSaving(true);
    const n = name.trim();
    if (n && n !== user!.name) await setProfileName(n);
    if (avatar !== (user!.avatar ?? "")) await setProfileAvatar(avatar);

    // Cada tipo se guarda por separado; conservamos solo los que tienen valor.
    const pays: PayMethod[] = (Object.keys(payDraft) as PayType[])
      .map((type) => {
        const value = (payDraft[type]?.value ?? "").trim();
        if (!value) return null;
        const v2 = type === "bank" ? (payDraft[type]?.value2 ?? "").trim() : "";
        return { type, value, ...(v2 ? { value2: v2 } : {}) } as PayMethod;
      })
      .filter((p): p is PayMethod => p !== null);

    // Una sola escritura para no perder datos por persistencias desordenadas.
    updateMyMember({
      ...(n && n !== user!.name ? { name: n } : {}),
      ...(avatar !== (user!.avatar ?? "") ? { avatar } : {}),
      initials: inits.trim() || undefined,
      country: country || undefined,
      phone: phone.trim() ? normalizePhone(phone, country || undefined) : undefined,
      pays,
      pay: pays[0], // compat. hacia atrás
    });

    setSaving(false);
    setSaved(true); // se queda en la vista; "Guardado" hasta que se edite algo
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">{t("account.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Avatar (Google por defecto; se puede subir una propia) */}
        <div className="flex justify-center mb-5">
          <label className="relative cursor-pointer group" title={t("account.changePhoto")}>
            {avatar ? (
              <img src={avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span
                className="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold"
                style={{ background: personColor(name || user.name) + "22" }}
              >
                {memberInitials({ initials: inits, name: name || user.name })}
              </span>
            )}
            <span
              className="absolute bottom-0 right-0 h-7 w-7 rounded-full flex items-center justify-center text-white shadow-md"
              style={{ background: "var(--ink)" }}
            >
              <Icon name="camera" size={14} />
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
          </label>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("account.name")}</label>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          />
        </div>

        {/* Initials */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("account.initials")}</label>
          <input
            value={inits}
            onChange={(e) => { setInits(e.target.value.toUpperCase().slice(0, 3)); setSaved(false); }}
            maxLength={3}
            placeholder={memberInitials({ name: name || user.name })}
            className="glass rounded-xl px-3 py-2.5 text-sm w-28 mt-1 font-mono uppercase"
          />
          <p className="text-xs text-muted mt-1">{t("account.initialsHint")}</p>
        </div>

        {/* Country */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("account.country")}</label>
          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); setSaved(false); }}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          >
            <option value="">{t("account.countryNone")}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} (+{c.dial})
              </option>
            ))}
          </select>
        </div>

        {/* Phone */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("account.phone")}</label>
          <input
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
            inputMode="tel"
            placeholder={country ? `+${dialCode(country)} …` : "+61 412 345 678"}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
            style={!phoneOk ? { boxShadow: "0 0 0 1.5px var(--coral)" } : undefined}
          />
          {!phoneOk ? (
            <p className="text-xs mt-1" style={{ color: "var(--coral)" }}>{t("account.phoneInvalid")}</p>
          ) : (
            <p className="text-xs text-muted mt-1">{t("account.phoneHint")}</p>
          )}
        </div>

        {/* Email read-only */}
        {user.email && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-muted mb-1">{t("login.email")}</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
        )}

        {/* Subscription */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("pro.section")}</label>
          <div className="glass rounded-xl p-3 mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: plan === "pro" ? "rgba(91,91,240,0.15)" : "var(--glass)",
                  color: plan === "pro" ? "var(--indigo)" : "var(--muted)",
                }}
              >
                <Icon name="sparkles" size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {plan === "pro" ? t("pro.planPro") : t("pro.planFree")}
                </div>
                <div className="text-xs text-muted truncate">
                  {plan === "pro" ? t("pro.proHint") : t("pro.freeHint", { n: FREE_AI_QUOTA })}
                </div>
              </div>
            </div>
            {plan === "free" ? (
              <button
                onClick={() => setShowPaywall(true)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white shrink-0 hover-lift"
                style={{ background: "var(--indigo)" }}
              >
                {t("pro.upgrade")}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold shrink-0"
                style={{ color: "var(--indigo)" }}
              >
                <Icon name="check" size={14} /> {t("pro.active")}
              </span>
            )}
          </div>
        </div>

        {/* Payment method */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted">{t("pay.methods")}</label>
          <p className="text-xs text-muted mt-0.5 mb-2">{t("account.payHint")}</p>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {PAY_TYPES.map((pt) => {
              const on = payType === pt;
              const filled = !!payDraft[pt]?.value?.trim();
              return (
                <button
                  key={pt}
                  onClick={() => setPayType(pt)}
                  className={`rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1 ${on ? "" : "glass text-muted"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {filled && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: on ? "var(--pill-fg)" : "var(--teal)" }}
                    />
                  )}
                  {t(`pay.label.${pt}`)}
                </button>
              );
            })}
          </div>
          {payType === "bank" ? (
            <div className="flex gap-2">
              <div className="w-28">
                <label className="text-[11px] font-semibold text-muted">{t("pay.bank.bsb")}</label>
                <input
                  value={cur.value}
                  onChange={(e) => setCur({ value: e.target.value })}
                  placeholder={t("pay.ph.bankBsb")}
                  className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1 font-mono"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-muted">{t("pay.bank.account")}</label>
                <input
                  value={cur.value2 ?? ""}
                  onChange={(e) => setCur({ value2: e.target.value })}
                  placeholder={t("pay.ph.bankAccount")}
                  className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1 font-mono"
                />
              </div>
            </div>
          ) : (
            <input
              value={cur.value}
              onChange={(e) => setCur({ value: e.target.value })}
              placeholder={t(`pay.ph.${payType}`)}
              className="glass rounded-xl px-3 py-2.5 text-sm w-full"
            />
          )}
        </div>

        {/* Push notifications */}
        {pushSupported() && (
          <div className="mb-6">
            <label className="text-xs font-semibold text-muted">{t("account.notifications")}</label>
            <div className="glass rounded-xl p-3 mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: pushOn ? "rgba(15,163,163,0.15)" : "var(--glass)", color: pushOn ? "var(--teal)" : "var(--muted)" }}
                >
                  <Icon name="bell" size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{pushOn ? t("account.notifEnabled") : t("account.notifEnable")}</div>
                  <div className="text-xs text-muted">{t("account.notifHint")}</div>
                </div>
              </div>
              <button
                onClick={togglePush}
                disabled={pushBusy}
                className="rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 hover-lift disabled:opacity-40"
                style={pushOn ? { background: "var(--glass)", color: "var(--muted)" } : { background: "var(--teal)", color: "#fff" }}
              >
                {pushBusy ? "…" : pushOn ? t("account.notifOff") : t("account.notifOn")}
              </button>
            </div>
            {pushMsg && <p className="text-xs mt-1" style={{ color: "var(--coral)" }}>{pushMsg}</p>}
          </div>
        )}

        {/* Enviar comentarios / reportar problema */}
        <button
          onClick={() => setShowFeedback(true)}
          className="glass rounded-xl p-3 mb-6 w-full flex items-center gap-2 text-left hover-lift"
        >
          <span className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(91,91,240,0.14)", color: "var(--indigo)" }}>
            <Icon name="chat" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("feedback.entry")}</div>
            <div className="text-xs text-muted">{t("feedback.entrySub")}</div>
          </div>
          <Icon name="chevron" size={16} className="text-muted shrink-0" />
        </button>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || !name.trim() || !phoneOk || saved}
            className="flex-1 rounded-full py-3 font-semibold text-white hover-lift disabled:opacity-60"
            style={{ background: saved ? "#0A8B5E" : "var(--ink)" }}
          >
            {saved ? `✓ ${t("account.saved")}` : saving ? "…" : t("common.save")}
          </button>
          <button
            onClick={onClose}
            className="rounded-full px-5 py-3 font-semibold glass text-muted hover-lift"
          >
            {t("common.close")}
          </button>
        </div>

        {/* Danger zone: delete account */}
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          {delConfirm && (
            <p className="text-xs mb-2" style={{ color: "var(--coral)" }}>{t("account.deleteWarn")}</p>
          )}
          <button
            onClick={onDelete}
            disabled={delBusy}
            className="text-sm font-semibold hover-lift disabled:opacity-40 inline-flex items-center gap-1.5"
            style={{ color: "var(--coral)" }}
          >
            <Icon name="trash" size={14} />
            {delBusy ? "…" : delConfirm ? t("account.deleteConfirm") : t("account.delete")}
          </button>
        </div>

        {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
        {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      </div>
    </Overlay>
  );
}
