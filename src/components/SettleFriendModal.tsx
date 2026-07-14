import { useMemo, useState } from "react";
import { useGroups, updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uid, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { getDailyRate } from "../lib/fxCache";
import { CURRENCIES, resolveToCode, currencySymbol } from "../lib/currencies";
import { payClipboardText } from "../lib/pay";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import type { Friend } from "../lib/friends";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldar con un amigo cruzando todos los grupos: se eligen los gastos a pagar
 *  de cada grupo, se ve el total (con opción de convertir a una moneda, Pro) y
 *  se registra un pago pendiente en cada grupo de golpe. El pago real es UNA
 *  transferencia; la app solo registra los settlements. */
export function SettleFriendModal({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const t = useT();
  const groups = useGroups();

  // Solo se puede saldar lo que TÚ debes (iOwe). Lo que te deben lo paga el otro.
  const owedGroups = useMemo(() => friend.groups.filter((g) => g.iOweTotal > 0.005), [friend.groups]);

  // Selección de gastos por grupo (por defecto, todos).
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of owedGroups) init[g.groupId] = new Set(g.iOwe.map((d) => d.expenseId));
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  function copyPay(i: number, value: string) {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
  }

  // Conversión opcional a una moneda (Pro). "" = mostrar por moneda.
  const [target, setTarget] = useState<string>("");
  const [rates, setRates] = useState<Record<string, number>>({}); // símbolo grupo -> tasa a target
  const [rateLoading, setRateLoading] = useState(false);

  const currencies = useMemo(
    () => [...new Set(owedGroups.map((g) => g.currency))],
    [owedGroups]
  );
  const mixed = currencies.length > 1;

  function toggle(groupId: string, expenseId: string) {
    setSelected((prev) => {
      const next = { ...prev, [groupId]: new Set(prev[groupId]) };
      if (next[groupId].has(expenseId)) next[groupId].delete(expenseId);
      else next[groupId].add(expenseId);
      return next;
    });
  }

  const groupTotal = (g: (typeof owedGroups)[number]) =>
    r2(g.iOwe.filter((d) => selected[g.groupId]?.has(d.expenseId)).reduce((s, d) => s + d.amount, 0));

  // Subtotales por moneda (siempre disponibles, sin conversión).
  const perCurrency = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const g of owedGroups) acc[g.currency] = r2((acc[g.currency] ?? 0) + groupTotal(g));
    return acc;
  }, [owedGroups, selected]);

  async function convertTo(sym: string) {
    setTarget(sym);
    if (!sym) return;
    setRateLoading(true);
    const targetCode = resolveToCode(sym);
    const next: Record<string, number> = {};
    for (const c of currencies) {
      if (c === sym) { next[c] = 1; continue; }
      const rate = await getDailyRate(resolveToCode(c), targetCode);
      next[c] = rate ?? NaN;
    }
    setRates(next);
    setRateLoading(false);
  }

  const convertedTotal = useMemo(() => {
    if (!target) return null;
    let sum = 0;
    for (const g of owedGroups) {
      const rate = rates[g.currency];
      if (!rate || Number.isNaN(rate)) return null; // falta alguna tasa
      sum += groupTotal(g) * rate;
    }
    return r2(sum);
  }, [target, rates, owedGroups, selected]);

  const anySelected = owedGroups.some((g) => groupTotal(g) > 0.005);

  function settle() {
    if (!anySelected || saving) return;
    setSaving(true);
    for (const fg of owedGroups) {
      const picked = fg.iOwe.filter((d) => selected[fg.groupId]?.has(d.expenseId));
      const amount = r2(picked.reduce((s, d) => s + d.amount, 0));
      if (amount < 0.005) continue;
      const g = groups.find((x) => x.id === fg.groupId);
      if (!g) continue;
      const name = (id: string) => g.members.find((m) => m.id === id)?.name ?? "?";
      updateGroup(fg.groupId, (gg) => ({
        ...gg,
        settlements: [
          ...(gg.settlements ?? []),
          {
            id: uid(),
            from: fg.myMemberId,
            to: fg.friendMemberId,
            amount,
            date: new Date().toISOString().slice(0, 10),
            status: "pending" as const, // lo confirma quien cobra
            expenseIds: picked.map((d) => d.expenseId),
          },
        ],
        notifications: withNotif(gg, {
          type: "payment_made",
          actorId: fg.myMemberId,
          actorName: name(fg.myMemberId),
          toId: fg.friendMemberId,
          toName: name(fg.friendMemberId),
          amount,
        }),
        activity: withActivity(gg, {
          type: "payment_made",
          actorId: fg.myMemberId,
          actorName: name(fg.myMemberId),
          toId: fg.friendMemberId,
          toName: name(fg.friendMemberId),
          amount,
        }),
      }));
      notifyGroup(
        fg.groupId,
        fg.groupName,
        t("notif.payment_made", { name: name(fg.myMemberId), amt: money(amount, fg.currency), to: name(fg.friendMemberId) })
      );
    }
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-md p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-xl font-bold">{t("friends.settleTitle", { name: friend.name })}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted shrink-0">
            <Icon name="close" size={16} />
          </button>
        </div>

        {owedGroups.length === 0 ? (
          <p className="text-sm text-muted mt-3">{t("friends.nothingToSettle", { name: friend.name })}</p>
        ) : (
          <>
            <p className="text-sm text-muted mb-3">{t("friends.settleDesc")}</p>

            {/* Un bloque por grupo con sus gastos elegibles */}
            <div className="space-y-3">
              {owedGroups.map((g) => (
                <div key={g.groupId} className="glass rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm truncate leading-relaxed">{g.groupName}</span>
                    <span className="font-mono font-bold text-sm shrink-0">{money(groupTotal(g), g.currency)}</span>
                  </div>
                  <div className="space-y-0.5">
                    {g.iOwe.map((d) => {
                      const on = selected[g.groupId]?.has(d.expenseId);
                      return (
                        <button
                          key={d.expenseId}
                          onClick={() => toggle(g.groupId, d.expenseId)}
                          className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover-lift"
                          style={on ? { background: "var(--surface-soft)" } : undefined}
                        >
                          <span
                            className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: on ? "var(--teal)" : "transparent", border: on ? "none" : "1.5px solid var(--line)", color: "#fff" }}
                          >
                            {on && <Icon name="check" size={12} />}
                          </span>
                          <span className="text-sm flex-1 min-w-0 truncate">{d.label || "—"}</span>
                          <span className="text-sm font-mono shrink-0">{money(d.amount, g.currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Conversión de moneda (Pro) cuando hay monedas mezcladas */}
            {mixed && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted">{t("friends.convertTo")}</span>
                <select
                  value={target}
                  onChange={(e) => convertTo(e.target.value)}
                  className="glass rounded-lg px-2 py-1 text-sm flex-1"
                >
                  <option value="">{t("friends.perCurrency")}</option>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.symbol}>{c.symbol} {c.code}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Total(es) */}
            <div className="glass rounded-2xl p-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t("friends.total")}</span>
                {target ? (
                  <span className="font-mono font-bold text-lg">
                    {rateLoading ? "…" : convertedTotal == null ? "—" : money(convertedTotal, target)}
                  </span>
                ) : (
                  <div className="text-right">
                    {Object.entries(perCurrency).map(([sym, amt]) => (
                      <div key={sym} className="font-mono font-bold text-lg leading-tight">{money(amt, sym)}</div>
                    ))}
                  </div>
                )}
              </div>
              {target && convertedTotal != null && mixed && (
                <div className="text-[11px] text-muted mt-1">{t("friends.convertNote", { cur: currencySymbol(resolveToCode(target)) })}</div>
              )}
            </div>

            {/* Métodos de pago del amigo, para pagarle sin salir */}
            {friend.pays.length > 0 && (
              <div className="glass rounded-2xl p-3 mt-3">
                <div className="text-xs font-semibold text-muted mb-1.5">{t("friends.payWith", { name: friend.name })}</div>
                <div className="space-y-1.5">
                  {friend.pays.map((pm, i) => (
                    <button
                      key={i}
                      onClick={() => copyPay(i, payClipboardText(pm))}
                      className="w-full flex items-center gap-2 text-left glass rounded-xl px-3 py-2 hover-lift"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] text-muted uppercase tracking-wide">{t(`pay.label.${pm.type}`)}</span>
                        <span className="block font-mono text-sm truncate">{pm.value}{pm.value2 ? ` · ${pm.value2}` : ""}</span>
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted">
                        {copied === i ? (
                          <><Icon name="check" size={14} style={{ color: "#0A8B5E" }} /> {t("pay.copied.short")}</>
                        ) : (
                          <><Icon name="copy" size={14} /> {t("pay.copy")}</>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={settle}
                disabled={!anySelected || saving}
                className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-40"
              >
                {saving ? t("scan.saving") : t("friends.markAllPaid")}
              </button>
              <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
