import { useState } from "react";
import type { Group } from "../lib/types";
import { computeSettle, directTransfers } from "../lib/split";
import { updateGroup } from "../lib/store";
import { personColor, memberInitials, sortedMembers, fmtDate } from "../lib/format";
import { useT } from "../lib/i18n";
import { useGroupMoney } from "../lib/displayCurrency";
import { Icon } from "./Icon";
import { MarkPaidModal } from "./MarkPaidModal";
import { PaySheet } from "./PaySheet";

export function Balances({ group }: { group: Group }) {
  const t = useT();
  const money = useGroupMoney(group);
  const settlements = group.settlements ?? [];
  const { paid, net, transfers: minTransfers } = computeSettle(group.members, group.expenses, settlements);
  // Modo de pago: simplificado (mínimas transferencias) por defecto, o directo.
  const transfers =
    group.simplifyDebts === false
      ? directTransfers(group.members, group.expenses, settlements)
      : minTransfers;
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  const member = (id: string) => group.members.find((m) => m.id === id);
  const pending = settlements.filter((s) => s.status === "pending");
  const confirmed = settlements.filter((s) => s.status === "confirmed");
  // ¿Hay ya un pago pendiente para esta transferencia (deudor→acreedor)?
  const pendingFor = (from: string, to: string) =>
    pending.find((s) => s.from === from && s.to === to);
  // Pagos pendientes que ME toca confirmar (soy quien cobra).
  const toConfirm = pending.filter((s) => s.to === group.meId);

  const [mark, setMark] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [paySheet, setPaySheet] = useState<{ to: string; amount: number } | null>(null);
  const [logFilter, setLogFilter] = useState<string>("all");
  const sortedConfirmed = [...confirmed].sort((a, b) => b.date.localeCompare(a.date));
  const filteredLog =
    logFilter === "all" ? sortedConfirmed : sortedConfirmed.filter((s) => s.from === logFilter || s.to === logFilter);

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
      {/* Pagos por confirmar (los ve quien cobra). Arriba del todo para que no
          se pierda: alguien marcó que te pagó y falta tu confirmación. */}
      {toConfirm.length > 0 && (
        <div
          className="rounded-3xl p-4"
          style={{ background: "rgba(232,146,12,0.12)", border: "1px solid rgba(232,146,12,0.35)" }}
        >
          <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#B5730A" }}>
            {t("pay.toConfirmTitle")}
          </div>
          <div className="space-y-2">
            {toConfirm.map((s) => (
              <div key={s.id} className="glass rounded-2xl p-3">
                <div className="text-sm flex items-start gap-2">
                  <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-muted" />
                  <span>{t("pay.saysPaid", { from: name(s.from), amt: money(s.amount), to: name(s.to) })}</span>
                </div>
                {s.proof && <img src={s.proof} alt="" className="max-h-24 rounded-lg mt-1.5" />}
                <div className="flex gap-2 mt-2 items-center">
                  <button
                    onClick={() => confirmS(s.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
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
        </div>
      )}

      {/* Total pill */}
      <div className="glass rounded-3xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-muted">{t("bal.totalSpent")}</span>
        <span className="font-mono font-bold">{money(total)}</span>
      </div>

      <div className="space-y-3">
      {/* Saldos por persona */}
      <div className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("bal.title")}</div>
        <div className="mt-3 space-y-1.5">
          {sortedMembers(group.members).map((m) => {
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
                      · {t("bal.paid", { amt: money(paid[m.id] || 0) })}
                    </span>
                  </span>
                </span>
                <span
                  className="font-mono font-bold text-right shrink-0"
                  style={{ color: ok ? "var(--muted)" : v > 0 ? "#0A8B5E" : "#D14444" }}
                >
                  {ok ? t("bal.uptodate") : v > 0 ? `+${money(v)}` : `−${money(-v)}`}
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
                  <span className="font-mono font-bold ml-auto">{money(tr.amount)}</span>
                </div>
                {/* Solo el DEUDOR ve "Pagar" y "Marcar pagado". Si ya marcó, queda
                    a la espera de que el acreedor confirme. */}
                {tr.from === group.meId && (
                  <div className="flex gap-2 mt-1.5 pl-8 items-center">
                    {pendingFor(tr.from, tr.to) ? (
                      <span className="text-xs text-muted inline-flex items-center gap-1">
                        <Icon name="clock" size={13} /> {t("pay.awaiting")}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => setMark({ from: tr.from, to: tr.to, amount: tr.amount })}
                          className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift"
                          style={{ background: "var(--teal)" }}
                        >
                          {t("pay.pay")}
                        </button>
                        <button
                          onClick={() => setPaySheet({ to: tr.to, amount: tr.amount })}
                          className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted"
                        >
                          {t("pay.method")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log de pagos: historial completo (con fecha) filtrable por persona,
          para ver quién pagó qué y cuándo. */}
      <div className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("pay.logTitle")}</div>
        {confirmed.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-0.5">
            <button
              onClick={() => setLogFilter("all")}
              className="rounded-full px-3 py-1 text-xs font-semibold shrink-0 hover-lift"
              style={
                logFilter === "all"
                  ? { background: "var(--pill-bg)", color: "var(--pill-fg)" }
                  : { background: "var(--surface-soft)", color: "var(--muted)" }
              }
            >
              {t("pay.logAll")}
            </button>
            {sortedMembers(group.members)
              .filter((m) => confirmed.some((s) => s.from === m.id || s.to === m.id))
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => setLogFilter(m.id)}
                  className="rounded-full px-3 py-1 text-xs font-semibold shrink-0 hover-lift"
                  style={
                    logFilter === m.id
                      ? { background: "var(--pill-bg)", color: "var(--pill-fg)" }
                      : { background: "var(--surface-soft)", color: "var(--muted)" }
                  }
                >
                  {m.name}
                </button>
              ))}
          </div>
        )}

        {filteredLog.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">{t("pay.logEmpty")}</div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {filteredLog.map((s) => {
              const covered = (s.expenseIds ?? [])
                .map((id) => group.expenses.find((e) => e.id === id)?.label)
                .filter(Boolean);
              return (
                <div key={s.id} className="text-sm border-b border-[color:var(--line)] last:border-0 pb-2.5 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                      style={{ background: personColor(name(s.from)) }}
                    >
                      {memberInitials(member(s.from) ?? { name: name(s.from) })}
                    </span>
                    <b>{name(s.from)}</b>
                    <span className="text-muted">{t("bal.paysTo")}</span>
                    <span
                      className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                      style={{ background: personColor(name(s.to)) }}
                    >
                      {memberInitials(member(s.to) ?? { name: name(s.to) })}
                    </span>
                    <b>{name(s.to)}</b>
                    <span className="font-mono font-bold ml-auto">{money(s.amount)}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1 pl-8">
                    {fmtDate(s.date)}
                    {covered.length > 0 && ` · ${t("pay.logCovers", { items: covered.join(", ") })}`}
                  </div>
                </div>
              );
            })}
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
