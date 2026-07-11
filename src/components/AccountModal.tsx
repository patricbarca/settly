import { useState, useMemo, type ChangeEvent } from "react";
import type { PayType, PayMethod } from "../lib/types";
import { useUser, setProfileName, setProfileAvatar, setProfileExtra, deleteAccount, signOut } from "../lib/auth";
import { useAllGroups, updateMyMember } from "../lib/store";
import { fileToAvatarDataUrl } from "../lib/image";
import { personColor, memberInitials } from "../lib/format";
import { enablePush, disablePush, isPushEnabled, pushSupported } from "../lib/push";
import { enableNativePush, disableNativePush, isNativePushOn, nativePushSupported } from "../lib/nativePush";
import { memberPays, payLink } from "../lib/pay";
import { countryList, dialCode, isValidPhone, normalizePhone } from "../lib/countries";
import { useT, useLang } from "../lib/i18n";
import { useTimezonePref, setTimezone, resolveTz, TIMEZONES } from "../lib/tz";
import { usePlan, FREE_AI_QUOTA, startPortal, useHasStripeSubscription, isNativePlatform } from "../lib/plan";
import { Icon } from "./Icon";
import { Paywall } from "./Paywall";
import { FeedbackModal } from "./FeedbackModal";
import { FaqModal } from "./FaqModal";

const PAY_TYPES: PayType[] = ["payid", "bank", "paypal", "revolut", "wise", "bizum", "bunq", "other"];

export function AccountModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const user = useUser();
  const groups = useAllGroups();
  const plan = usePlan();
  const hasStripe = useHasStripeSubscription();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  async function handlePortal() {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalErr(null);
    const err = await startPortal();
    if (err) {
      setPortalBusy(false);
      setPortalErr(err === "no_subscription" ? t("trial.noSubscription") : t("trial.manageError"));
    }
  }

  // Combina tus datos de TODOS los grupos (activos + papelera + archivados):
  // por cada campo toma el primer valor no vacío, para no perder nada aunque el
  // grupo que los tenía esté en la papelera.
  const myMembers = groups
    .map((g) => g.members.find((m) => m.id === g.meId))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const firstNonEmpty = (get: (m: (typeof myMembers)[number]) => string | undefined) =>
    myMembers.map(get).find((v) => v != null && v !== "") ?? "";
  // Métodos de pago: combinados por tipo (primer valor no vacío de cada tipo).
  const payByType: Record<string, PayMethod> = {};
  for (const m of myMembers) {
    for (const p of memberPays(m)) {
      if (p.value && !payByType[p.type]) payByType[p.type] = p;
    }
  }
  const richestPays = Object.values(payByType);
  // Fuente única = profiles (user.*). Si aún está vacío (no migrado), se cae al
  // valor combinado de los grupos, y al guardar se sube a profiles.
  const myMember = {
    initials: user?.initials || firstNonEmpty((m) => m.initials),
    country: user?.country || firstNonEmpty((m) => m.country),
    phone: user?.phone || firstNonEmpty((m) => m.phone),
    pays: user?.pays?.length ? user.pays : richestPays,
  };

  const lang = useLang();
  const tzPref = useTimezonePref();
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
  // En la app nativa el push va por APNs/FCM (nativePush); en la web, Web Push.
  const nativePush = nativePushSupported();
  const [pushOn, setPushOn] = useState(nativePush ? isNativePushOn() : isPushEnabled());
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
      if (nativePush) await disableNativePush();
      else await disablePush();
      setPushOn(false);
    } else {
      const r = nativePush ? await enableNativePush() : await enablePush();
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

    const normPhone = phone.trim() ? normalizePhone(phone, country || undefined) : "";

    // Fuente única: guarda los datos del perfil en la tabla profiles.
    await setProfileExtra({
      country: country || "",
      phone: normPhone,
      initials: inits.trim(),
      pays,
    });

    // Reflejo en los grupos para que los demás vean tu nombre/avatar/iniciales/pagos.
    updateMyMember({
      ...(n && n !== user!.name ? { name: n } : {}),
      ...(avatar !== (user!.avatar ?? "") ? { avatar } : {}),
      initials: inits.trim() || undefined,
      country: country || undefined,
      phone: normPhone || undefined,
      pays,
      pay: pays[0], // compat. hacia atrás
    });

    setSaving(false);
    setSaved(true); // se queda en la vista; "Guardado" hasta que se edite algo
  }

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col anim-up"
      style={{
        background: "var(--bg)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <h2 className="font-display text-2xl font-bold">{t("account.title")}</h2>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: "calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 24px)" }}
        >

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
            ) : hasStripe && !isNativePlatform() ? (
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  onClick={handlePortal}
                  disabled={portalBusy}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold hover-lift disabled:opacity-50"
                  style={{ background: "rgba(91,91,240,0.12)", color: "var(--indigo)" }}
                >
                  {portalBusy ? "…" : t("trial.manage")}
                </button>
                {portalErr && <p className="text-xs text-red-500">{portalErr}</p>}
              </div>
            ) : (
              <span
                className="rounded-full px-3 py-1.5 text-xs font-semibold shrink-0"
                style={{ background: "rgba(91,91,240,0.12)", color: "var(--indigo)" }}
              >
                {t("pro.badge")}
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
          {(() => {
            const preview = payLink({ type: payType, value: cur.value.trim() }, 0);
            if (!preview) return null;
            return (
              <div className="mt-2">
                <a
                  href={preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold hover-lift"
                  style={{ background: "rgba(15,163,163,0.12)", color: "var(--teal)" }}
                >
                  <Icon name="external" size={13} />
                  {t("pay.testLink")}
                </a>
                <p className="text-[11px] text-muted mt-1">{t("pay.testLinkHint")}</p>
              </div>
            );
          })()}
        </div>

        {/* Zona horaria */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted">{t("account.timezone")}</label>
          <select
            value={tzPref}
            onChange={(e) => setTimezone(e.target.value)}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          >
            <option value="auto">{t("account.timezoneAuto")} — {resolveTz("auto")}</option>
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted mt-1">{t("account.timezoneHint")}</p>
        </div>

        {/* Push notifications */}
        {(nativePush || pushSupported()) && (
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

        {/* Preguntas frecuentes */}
        <button
          onClick={() => setShowFaq(true)}
          className="glass rounded-xl p-3 mb-3 w-full flex items-center gap-2 text-left hover-lift"
        >
          <span className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(15,163,163,0.14)", color: "var(--teal)" }}>
            <Icon name="help" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("faq.entry")}</div>
            <div className="text-xs text-muted">{t("faq.entrySub")}</div>
          </div>
          <Icon name="chevron" size={16} className="text-muted shrink-0" />
        </button>

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

        <button
          onClick={save}
          disabled={saving || !name.trim() || !phoneOk || saved}
          className="w-full rounded-full py-3 font-semibold text-white hover-lift disabled:opacity-60"
          style={{ background: saved ? "#0A8B5E" : "var(--ink)" }}
        >
          {saved ? `✓ ${t("account.saved")}` : saving ? "…" : t("common.save")}
        </button>

        <button
          onClick={signOut}
          className="mt-4 w-full rounded-full py-2.5 text-sm font-semibold glass hover-lift inline-flex items-center justify-center gap-1.5 text-muted"
        >
          <Icon name="power" size={14} />
          {t("app.signout")}
        </button>

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

        <div className="text-center text-[10px] opacity-40 font-mono mt-8">v {__BUILD_ID__}</div>

        {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
        {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
        {showFaq && <FaqModal onClose={() => setShowFaq(false)} />}
        </div>
      </div>
    </div>
  );
}
