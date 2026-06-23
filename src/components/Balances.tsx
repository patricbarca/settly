import { useState } from "react";
import type { Group } from "../lib/types";
import { computeSettle } from "../lib/split";
import { updateGroup } from "../lib/store";
import { money, personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { MarkPaidModal } from "./MarkPaidModal";
import { PaySheet } from "./PaySheet";

export function Balances({ group }: { group: Group }) {
  const t = useT();
  const settlements = group.settlements ?? [];
  const { paid, net, transfers } = computeSettle(group.members, group.expenses, settlements);
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  const member = (id: string) => group.members.find((m) => m.id === id);
  const pending = settlements.filter((s) => s.status === "pending");
  const confirmed = settlements.filter((s) => s.status === "confirmed");

  const [mark, setMark] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [paySheet, setPaySheet] = useState<{ to: string; amount: number } | null>(null);

  const confirmS = (id: string) =>
    updateGroup(group.id, (g) => ({
      ...g,
      settlements: (g.settlements ?? []).map((s) => (s.id === id ? { ...s, status: "confirmed" as const } : s)),
    }));
  const rejectS = (id: string) =>
    updateGroup(group.id, (g) => ({
      ...g,
      settlements: (g.settlements ?? []).filter((s) => s.id !== id),
    }));

  return (
    <section className="space-y-3">
      {/* Total pill */}
      <div className="glass rounded-3xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-muted">{t("bal.totalSpent")}</span>
        <span className="font-mono font-bold">{money(total, group.currency)}</span>
      </div>

      <div className="space-y-3">
      {/* Saldos por persona */}
      <div className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("bal.title")}</div>
        <div className="mt-3 space-y-1.5">
          {group.members.map((m) => {
            const v = net[m.id] || 0;
            const ok = Math.abs(v) < 0.01;
            return (
              <div key={m.id} className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                    style={{ background: personColor(m.name) + "22" }}
                  >
                    {memberInitials(m)}
                  </span>
                  <span className="truncate">
                    {m.name}{" "}
                    <span className="text-muted text-xs">
                      · {t("bal.paid", { amt: money(paid[m.id] || 0, group.currency) })}
                    </span>
                  </span>
                </span>
                <span
                  className="font-mono font-bold text-right shrink-0"
                  style={{ color: ok ? "var(--muted)" : v > 0 ? "#0A8B5E" : "#D14444" }}
                >
                  {ok ? t("bal.uptodate") : v > 0 ? `+${money(v, group.currency)}` : `−${money(-v, group.currency)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Para saldar + pagos */}
      <div className="glass rounded-3xl p-5">
        <div>
          <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("bal.toSettle")}</div>
          <div className="text-[11px] text-muted mt-0.5">{t("bal.simplified")}</div>
        </div>

        {transfers.length === 0 && pending.length === 0 ? (
          <div className="text-sm text-muted py-8 text-center">{t("bal.allSettled")}</div>
        ) : (
          <div className="mt-3 space-y-3">
            {transfers.map((tr, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ background: personColor(name(tr.from)) }}
                  >
                    {memberInitials(member(tr.from) ?? { name: name(tr.from) })}
                  </span>
                  <b>{name(tr.from)}</b>
                  <span className="text-muted">{t("bal.paysTo")}</span>
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ background: personColor(name(tr.to)) }}
                  >
                    {memberInitials(member(tr.to) ?? { name: name(tr.to) })}
                  </span>
                  <b>{name(tr.to)}</b>
                  <span className="font-mono font-bold ml-auto">{money(tr.amount, group.currency)}</span>
                </div>
                {(tr.from === group.meId || tr.to === group.meId) && (
                  <div className="flex gap-2 mt-1.5 pl-8">
                    {/* Solo quien debe pagar ve "Pagar" */}
                    {tr.from === group.meId && (
                      <button
                        onClick={() => setPaySheet({ to: tr.to, amount: tr.amount })}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift"
                        style={{ background: "var(--teal)" }}
                      >
                        {t("pay.pay")}
                      </button>
                    )}
                    {/* Solo quien cobra confirma el pago recibido */}
                    {tr.to === group.meId && (
                      <button
                        onClick={() => setMark({ from: tr.from, to: tr.to, amount: tr.amount })}
                        className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted"
                      >
                        {t("pay.markPaid")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {pending.length > 0 && (
              <div className="pt-1">
                <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1">{t("pay.pending")}</div>
                {pending.map((s) => (
                  <div key={s.id} className="glass rounded-xl p-2.5 mb-1.5">
                    <div className="text-sm flex items-start gap-2">
                      <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-muted" />
                      <span>{t("pay.saysPaid", { from: name(s.from), amt: money(s.amount, group.currency), to: name(s.to) })}</span>
                    </div>
                    {s.proof && <img src={s.proof} alt="" className="max-h-20 rounded-lg mt-1.5" />}
                    <div className="flex gap-2 mt-2 items-center">
                      <button
                        onClick={() => confirmS(s.id)}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{ background: "#0A8B5E" }}
                      >
                        {t("pay.confirmReceived")}
                      </button>
                      <button onClick={() => rejectS(s.id)} className="lk lk-danger text-xs">
                        {t("pay.reject")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {confirmed.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1">{t("pay.history")}</div>
            {confirmed
              .slice(-4)
              .reverse()
              .map((s) => (
                <div key={s.id} className="text-xs text-muted flex items-center gap-1.5 py-0.5">
                  <Icon name="check" size={13} style={{ color: "#0A8B5E" }} />
                  {t("pay.saysPaid", { from: name(s.from), amt: money(s.amount, group.currency), to: name(s.to) })}
                </div>
              ))}
          </div>
        )}
      </div>

      {paySheet && (
        <PaySheet group={group} to={paySheet.to} amount={paySheet.amount} onClose={() => setPaySheet(null)} />
      )}
      {mark && (
        <MarkPaidModal
          group={group}
          from={mark.from}
          to={mark.to}
          amount={mark.amount}
          onClose={() => setMark(null)}
        />
      )}
      </div>
    </section>
  );
}
