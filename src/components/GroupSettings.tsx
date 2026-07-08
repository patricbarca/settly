import { useState } from "react";
import type { Group, GroupKind } from "../lib/types";
import { updateGroup, deleteGroup, leaveGroup } from "../lib/store";
import { useUser } from "../lib/auth";
import { withActivity } from "../lib/activity";
import { computeSettle } from "../lib/split";
import { money, personColor, memberInitials, sortedMembers } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { usePlan } from "../lib/plan";
import { CURRENCIES, currencyOf, localCurrencyName, resolveToCode } from "../lib/currencies";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";

const COMMON_CODES = ["EUR", "USD", "GBP", "AUD", "CAD", "CHF", "MXN", "BRL", "COP", "ARS", "JPY"];

export function GroupSettings({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "es" ? "es-ES" : "en-US";

  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(() => resolveToCode(group.currency));
  const [kind, setKind] = useState<GroupKind>(group.kind ?? "trip");
  const [simplify, setSimplify] = useState(group.simplifyDebts !== false);
  const [secondaryCurrency, setSecondaryCurrency] = useState(group.secondaryCurrency ?? "");
  const [displayCurrency, setDisplayCurrency] = useState(group.displayCurrency ?? group.currency);
  const [saved, setSaved] = useState(false);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const plan = usePlan();
  const user = useUser();
  // Dueño = creador del grupo (o grupo local sin owner, p. ej. invitado).
  const isOwner = !group.ownerId || group.ownerId === user?.id;

  function deleteOrLeave() {
    if (isOwner) deleteGroup(group.id);
    else leaveGroup(group.id);
    onClose();
  }

  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);

  const referenced = new Set<string>();
  group.expenses.forEach((e) => {
    referenced.add(e.payerId);
    e.participantIds.forEach((p) => referenced.add(p));
    e.payments?.forEach((p) => referenced.add(p.memberId));
  });
  (group.settlements ?? []).forEach((s) => {
    referenced.add(s.from);
    referenced.add(s.to);
  });

  const dirty =
    name.trim() !== group.name ||
    currency !== resolveToCode(group.currency) ||
    kind !== (group.kind ?? "trip") ||
    simplify !== (group.simplifyDebts !== false) ||
    secondaryCurrency !== (group.secondaryCurrency ?? "") ||
    displayCurrency !== (group.displayCurrency ?? group.currency);

  function save() {
    const n = name.trim();
    const c = currency.trim();
    if (!n || !c) return;
    const sc = plan === "pro" ? secondaryCurrency.trim() || undefined : undefined;
    const dc = sc && displayCurrency === sc ? sc : c;
    updateGroup(group.id, (g) => ({
      ...g,
      name: n,
      currency: c,
      kind,
      simplifyDebts: simplify,
      secondaryCurrency: sc,
      displayCurrency: dc,
    }));
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  function removeMember(id: string) {
    const removed = group.members.find((m) => m.id === id)?.name;
    updateGroup(group.id, (g) => ({
      ...g,
      members: g.members.filter((m) => m.id !== id),
      activity: withActivity(g, {
        type: "member_removed",
        actorId: g.meId,
        actorName: g.members.find((m) => m.id === g.meId)?.name,
        label: removed,
      }),
    }));
  }

  const isCommon = COMMON_CODES.includes(currency);

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">{t("settings.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("members.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          />
        </div>

        {/* Currency */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("settings.currency")}</label>

          {/* Common currencies as quick-pick pills */}
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            {COMMON_CODES.map((code) => {
              const c = currencyOf(code);
              const on = currency === code;
              return (
                <button
                  key={code}
                  onClick={() => setCurrency(code)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${on ? "" : "glass text-muted"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                  title={localCurrencyName(code, locale)}
                >
                  {c.symbol}
                </button>
              );
            })}
          </div>

          {/* Full searchable dropdown */}
          <select
            value={isCommon ? "" : currency}
            onChange={(e) => { if (e.target.value) setCurrency(e.target.value); }}
            className="glass rounded-xl px-3 py-2 text-sm mt-2 w-full"
          >
            <option value="">{t("settings.currencyOther")}</option>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code} — {localCurrencyName(c.code, locale)}
              </option>
            ))}
          </select>
        </div>

        {/* Segunda moneda + toggle de visualización (Pro) */}
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted">{t("settings.secondaryCurrency")}</label>
            {plan !== "pro" && (
              <button onClick={() => setShowPaywall(true)} className="text-xs font-semibold" style={{ color: "var(--indigo)" }}>
                {t("pro.upgrade")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5 mb-2">{t("settings.secondaryCurrencyHint")}</p>
          <select
            value={secondaryCurrency}
            disabled={plan !== "pro"}
            onChange={(e) => {
              setSecondaryCurrency(e.target.value);
              if (!e.target.value) setDisplayCurrency(currency);
            }}
            className="glass rounded-xl px-3 py-2 text-sm w-full disabled:opacity-50"
          >
            <option value="">{t("settings.secondaryCurrencyNone")}</option>
            {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code} — {localCurrencyName(c.code, locale)}
              </option>
            ))}
          </select>

          {plan === "pro" && secondaryCurrency && (
            <div className="glass rounded-full p-0.5 flex text-sm font-semibold mt-2">
              {[currency, secondaryCurrency].map((code) => {
                const on = displayCurrency === code;
                return (
                  <button
                    key={code}
                    onClick={() => setDisplayCurrency(code)}
                    className={`flex-1 px-3 py-1.5 rounded-full ${on ? "" : "text-muted"}`}
                    style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Group kind */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("create.kind")}</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {(["trip", "home"] as GroupKind[]).map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-2xl p-2.5 text-left hover-lift ${on ? "" : "glass"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon name={k === "home" ? "home" : "plane"} size={14} />
                    {t(k === "home" ? "create.kindHome" : "create.kindTrip")}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment mode */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("settings.payMode")}</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {[true, false].map((s) => {
              const on = simplify === s;
              return (
                <button
                  key={String(s)}
                  onClick={() => setSimplify(s)}
                  className={`rounded-2xl p-2.5 text-sm font-semibold text-center hover-lift ${on ? "" : "glass"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {t(s ? "settings.paySimple" : "settings.payDirect")}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-1.5">
            {t(simplify ? "settings.payModeSimpleHint" : "settings.payModeDirectHint")}
          </p>
        </div>

        {/* Members */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-muted mb-2">{t("settings.members")}</div>
          <div className="space-y-2">
            {sortedMembers(group.members).map((m) => {
              const balance = net[m.id] ?? 0;
              const settled = Math.abs(balance) < 0.01;
              const canRemove = m.id !== group.meId && !referenced.has(m.id);
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                    style={{ background: personColor(m.name) + "22" }}
                  >
                    {memberInitials(m)}
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">
                    {m.name}
                    {m.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
                  </span>
                  {!settled && (
                    <span
                      className="text-xs font-mono shrink-0"
                      style={{ color: balance > 0 ? "#0A8B5E" : "#D14444" }}
                    >
                      {balance > 0 ? "+" : "−"}{money(Math.abs(balance), group.currency)}
                    </span>
                  )}
                  {canRemove ? (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="glass rounded-full h-7 w-7 flex items-center justify-center lk-danger text-muted hover-lift shrink-0"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  ) : (
                    <div className="h-7 w-7 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={save}
          disabled={!dirty || !name.trim()}
          className="w-full rounded-full py-3 font-semibold text-white hover-lift disabled:opacity-40"
          style={{ background: saved ? "#0A8B5E" : "var(--ink)" }}
        >
          {saved ? `✓ ${t("settings.saved")}` : t("common.save")}
        </button>

        {/* Zona de riesgo: eliminar (dueño) o salir (miembro) */}
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          {!confirmDanger ? (
            <button
              onClick={() => setConfirmDanger(true)}
              className="text-sm font-semibold hover-lift inline-flex items-center gap-1.5"
              style={{ color: "var(--coral)" }}
            >
              <Icon name={isOwner ? "trash" : "power"} size={14} />
              {isOwner ? t("group.delete") : t("group.leave")}
            </button>
          ) : (
            <div className="anim-up">
              <p className="text-xs mb-2" style={{ color: "var(--coral)" }}>
                {isOwner ? t("group.deleteRecoverWarn") : t("group.leaveWarn")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDanger(false)}
                  className="rounded-full px-4 py-2 text-sm glass text-muted hover-lift"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={deleteOrLeave}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white hover-lift"
                  style={{ background: "var(--coral)" }}
                >
                  {isOwner ? t("group.delete") : t("group.leave")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </Overlay>
  );
}
