import { useState } from "react";
import type { Group } from "../lib/types";
import { updateGroup } from "../lib/store";
import { computeSettle } from "../lib/split";
import { money, personColor, initials } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { CURRENCIES, currencyOf, localCurrencyName, resolveToCode } from "../lib/currencies";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

const COMMON_CODES = ["EUR", "USD", "GBP", "AUD", "CAD", "CHF", "MXN", "BRL", "COP", "ARS", "JPY"];

export function GroupSettings({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "es" ? "es-ES" : "en-US";

  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(() => resolveToCode(group.currency));
  const [saved, setSaved] = useState(false);

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

  const dirty = name.trim() !== group.name || currency !== resolveToCode(group.currency);

  function save() {
    const n = name.trim();
    const c = currency.trim();
    if (!n || !c) return;
    updateGroup(group.id, (g) => ({ ...g, name: n, currency: c }));
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  function removeMember(id: string) {
    updateGroup(group.id, (g) => ({ ...g, members: g.members.filter((m) => m.id !== id) }));
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

        {/* Members */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-muted mb-2">{t("settings.members")}</div>
          <div className="space-y-2">
            {group.members.map((m) => {
              const balance = net[m.id] ?? 0;
              const settled = Math.abs(balance) < 0.01;
              const canRemove = m.id !== group.meId && !referenced.has(m.id);
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                    style={{ background: personColor(m.name) + "22" }}
                  >
                    {initials(m.name)}
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
      </div>
    </Overlay>
  );
}
