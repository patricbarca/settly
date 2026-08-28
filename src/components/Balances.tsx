import { useState } from "react";
import type { Group, Settlement } from "../lib/types";
import { computeSettle, directTransfers } from "../lib/split";
import { setSettlementStatus, removeSettlement, rejectSettlement } from "../lib/store";
import { useUser } from "../lib/auth";
import { memberInitials, sortedMembers, fmtDate, displayName } from "../lib/format";
import { useT } from "../lib/i18n";
import { useGroupMoney } from "../lib/displayCurrency";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { MarkPaidModal } from "./MarkPaidModal";
import { PaySheet } from "./PaySheet";
import { EditPaymentExpensesModal } from "./EditPaymentExpensesModal";
import { ConfirmModal } from "./ConfirmModal";
import { BalanceExplainer } from "./BalanceExplainer";
import { TransferExplainer } from "./TransferExplainer";

export function Balances({ group }: { group: Group }) {
  const t = useT();
  const user = useUser();
  const isOwner = !group.ownerId || group.ownerId === user?.id;
  const direct = group.simplifyDebts === false;
  const money = useGroupMoney(group);
  const settlements = group.settlements ?? [];
  const { paid, net, transfers: minTransfers } = computeSettle(group.members, group.expenses, settlements);
  // Modo de pago: simplificado (mínimas transferencias) por defecto, o directo.
  const transfers =
    group.simplifyDebts === false
      ? directTransfers(group.members, group.expenses, settlements)
      : minTransfers;
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const name = (id: string) => {
    const m = group.members.find((mm) => mm.id === id);
    return m ? displayName(m) : "?";
  };
  const member = (id: string) => group.members.find((m) => m.id === id);
  const pending = settlements.filter((s) => s.status === "pending");
  const confirmed = settlements.filter((s) => s.status === "confirmed");
  // ¿Hay ya un pago pendiente para esta transferencia (deudor→acreedor)?
  const pendingFor = (from: string, to: string) =>
    pending.find((s) => s.from === from && s.to === to);
  // Pagos pendientes que ME toca confirmar (soy quien cobra).
  const toConfirm = pending.filter((s) => s.to === group.meId);
  // Pagos que YO marqué como hechos (o puse por otro) y aún no confirma el
  // acreedor → aparecen como "Pagado · esperando confirmación" (modelo optimista:
  // ya cuentan como saldados en los saldos; el acreedor puede rechazar).
  const myPending = pending.filter((s) => s.from === group.meId || s.settledBy === group.meId);

  const [mark, setMark] = useState<{ from: string; to: string; amount: number; confirmReceipt?: boolean } | null>(null);
  // Otras deudas hacia el MISMO acreedor que puedo cubrir en el mismo pago
  // (p. ej. pago lo mío y lo de mi pareja a la vez → una sola transferencia).
  // `exclude` = el deudor cuyo pago ya estoy registrando (para no repetirlo).
  const coverableFor = (to: string, exclude: string) =>
    transfers
      .filter((o) => o.to === to && o.from !== exclude && !pendingFor(o.from, o.to))
      .map((o) => ({ from: o.from, amount: o.amount }));
  const [paySheet, setPaySheet] = useState<{ to: string; amount: number } | null>(null);
  const [editSettlement, setEditSettlement] = useState<Settlement | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [explainTr, setExplainTr] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [cancelS, setCancelS] = useState<Settlement | null>(null);
  // El log incluye pagos CONFIRMADOS y también los PENDIENTES (awaiting) — así se
  // pueden cancelar desde aquí aunque el acreedor aún no confirme.
  const logSource = [...confirmed, ...pending].sort((a, b) => b.date.localeCompare(a.date));
  const filteredLog =
    logFilter === "all" ? logSource : logSource.filter((s) => s.from === logFilter || s.to === logFilter);
  // Quién puede cancelar un pago del log: el que pagó, quien cobra, quien lo puso
  // por otro, o el dueño del grupo. Cancelar = eliminarlo → la deuda reaparece.
  const canCancel = (s: Settlement) =>
    isOwner || s.from === group.meId || s.to === group.meId || s.settledBy === group.meId;

  const confirmS = (id: string) => setSettlementStatus(group.id, id, "confirmed");
  // Rechazo por el acreedor → avisa al deudor. "Deshacer" del deudor → sin aviso.
  const rejectS = (id: string) => rejectSettlement(group.id, id);
  const undoMyPayment = (id: string) => removeSettlement(group.id, id);

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
            const ok = Math.abs(v) < 0.005;
            return (
              <div key={m.id} className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar name={m.name} avatar={m.avatar} initials={memberInitials(m)} size={24} />
                  <span className="truncate">
                    {displayName(m)}{" "}
                    <span className="text-muted text-xs">
                      · {t("bal.paid", { amt: money(paid[m.id] || 0) })}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="font-mono font-bold text-right"
                    style={{ color: ok ? "var(--muted)" : v > 0 ? "#0A8B5E" : "#D14444" }}
                  >
                    {ok ? t("bal.uptodate") : v > 0 ? `+${money(v)}` : `−${money(-v)}`}
                  </span>
                  <button
                    onClick={() => setExplain(m.id)}
                    className="h-6 w-6 rounded-full glass flex items-center justify-center text-muted hover-lift"
                    title={t("explain.button")}
                    aria-label={t("explain.button")}
                  >
                    <Icon name="help" size={13} />
                  </button>
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

        {transfers.length === 0 ? (
          <div className="text-sm text-muted py-8 text-center">{t("bal.allSettled")}</div>
        ) : (
          <div className="mt-3 space-y-3">
            {transfers.map((tr, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <Avatar name={name(tr.from)} avatar={member(tr.from)?.avatar} initials={memberInitials(member(tr.from) ?? { name: name(tr.from) })} size={24} />
                  <b>{name(tr.from)}</b>
                  <span className="text-muted">{t("bal.paysTo")}</span>
                  <Avatar name={name(tr.to)} avatar={member(tr.to)?.avatar} initials={memberInitials(member(tr.to) ?? { name: name(tr.to) })} size={24} />
                  <b>{name(tr.to)}</b>
                  <span className="font-mono font-bold ml-auto">{money(tr.amount)}</span>
                  <button
                    onClick={() => setExplainTr({ from: tr.from, to: tr.to, amount: tr.amount })}
                    className="h-6 w-6 rounded-full glass flex items-center justify-center text-muted hover-lift shrink-0"
                    title={t("explain.button")}
                    aria-label={t("explain.button")}
                  >
                    <Icon name="help" size={13} />
                  </button>
                </div>
                {/* Solo el DEUDOR ve "Pagar". `tr.amount` ya es lo que queda por
                    saldar (los pagos marcados/pendientes se descuentan), así que
                    siempre puede pagar el resto — incluso si hay un pago parcial
                    esperando confirmación (ese se muestra en "Pagado · esperando"). */}
                {tr.from === group.meId ? (
                  <div className="flex gap-2 mt-1.5 pl-8 items-center">
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
                  </div>
                ) : tr.to === group.meId ? (
                  /* Me deben a MÍ: puedo registrar que ya me pagaron (queda
                     confirmado directamente). Si ya hay un pago pendiente para
                     esa deuda, no lo ofrezco (lo confirmo desde la caja de arriba). */
                  !pendingFor(tr.from, tr.to) && (
                    <div className="flex gap-2 mt-1.5 pl-8 items-center">
                      <button
                        onClick={() => setMark({ from: tr.from, to: tr.to, amount: tr.amount, confirmReceipt: true })}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift"
                        style={{ background: "#0A8B5E" }}
                      >
                        {t("pay.theyPaidMe", { who: name(tr.from) })}
                      </button>
                    </div>
                  )
                ) : (
                  /* Deuda de OTRO hacia un tercero: puedo pagarla por él/ella
                     (settledBy = yo). Si ya hay un pago pendiente, no ofrezco nada. */
                  group.meId && !pendingFor(tr.from, tr.to) && (
                    <div className="flex gap-2 mt-1.5 pl-8 items-center">
                      <button
                        onClick={() => setMark({ from: tr.from, to: tr.to, amount: tr.amount })}
                        className="glass rounded-full px-3 py-1 text-xs font-semibold hover-lift"
                        style={{ color: "var(--teal)" }}
                      >
                        {t("pay.payForThem", { who: name(tr.from) })}
                      </button>
                      <button
                        onClick={() => setPaySheet({ to: tr.to, amount: tr.amount })}
                        className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted"
                      >
                        {t("pay.method")}
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagos que YO marqué (esperando que el acreedor confirme). Ya cuentan como
          saldados; muestro el estado "Pagado" para que no aparezca como pendiente. */}
      {myPending.length > 0 && (
        <div className="glass rounded-3xl p-5">
          <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("pay.paidAwaitingTitle")}</div>
          <div className="mt-3 space-y-2.5">
            {myPending.map((s) => (
              <div key={s.id} className="text-sm border-b border-[color:var(--line)] last:border-0 pb-2.5 last:pb-0">
                <div className="flex items-center gap-2">
                  <Icon name="check" size={15} className="shrink-0" style={{ color: "#0A8B5E" }} />
                  <span className="min-w-0">
                    {s.settledBy && s.settledBy !== s.from
                      ? t("pay.youPaidForAwaiting", { who: name(s.from), amt: money(s.amount), to: name(s.to) })
                      : t("pay.youPaidAwaiting", { amt: money(s.amount), to: name(s.to) })}
                  </span>
                  <span className="font-mono font-bold ml-auto shrink-0" style={{ color: "#0A8B5E" }}>{money(s.amount)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 pl-7">
                  <span className="text-xs text-muted inline-flex items-center gap-1">
                    <Icon name="clock" size={12} /> {t("pay.awaiting")}
                  </span>
                  <button onClick={() => undoMyPayment(s.id)} className="lk text-xs text-muted ml-auto">
                    {t("pay.undoPaid")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log de pagos: historial completo (con fecha) filtrable por persona,
          para ver quién pagó qué y cuándo. */}
      <div className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("pay.logTitle")}</div>
        {logSource.length > 0 && (
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
              .filter((m) => logSource.some((s) => s.from === m.id || s.to === m.id))
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
                  {displayName(m)}
                </button>
              ))}
          </div>
        )}

        {filteredLog.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">{t("pay.logEmpty")}</div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {filteredLog.map((s) => {
              // En Simplificado el pago es neteado y no corresponde a gastos
              // concretos, así que no listamos "cubre: …" (sería engañoso).
              const covered = direct
                ? (s.expenseIds ?? [])
                    .map((id) => group.expenses.find((e) => e.id === id)?.label)
                    .filter(Boolean)
                : [];
              return (
                <div key={s.id} className="text-sm border-b border-[color:var(--line)] last:border-0 pb-2.5 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Avatar name={name(s.from)} avatar={member(s.from)?.avatar} initials={memberInitials(member(s.from) ?? { name: name(s.from) })} size={24} />
                    <b>{name(s.from)}</b>
                    <span className="text-muted">{t("bal.paysTo")}</span>
                    <Avatar name={name(s.to)} avatar={member(s.to)?.avatar} initials={memberInitials(member(s.to) ?? { name: name(s.to) })} size={24} />
                    <b>{name(s.to)}</b>
                    {s.settledBy && s.settledBy !== s.from && (
                      <span className="text-[10px] text-muted">({t("pay.coveredBy", { name: name(s.settledBy) })})</span>
                    )}
                    {s.status === "pending" && (
                      <span className="text-[10px] inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 shrink-0" style={{ background: "rgba(232,146,12,0.14)", color: "#B5730A" }}>
                        <Icon name="clock" size={10} /> {t("pay.awaiting")}
                      </span>
                    )}
                    <span className="font-mono font-bold ml-auto">{money(s.amount)}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1 pl-8 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {fmtDate(s.date)}
                      {covered.length > 0 && ` · ${t("pay.logCovers", { items: covered.join(", ") })}`}
                    </span>
                    {isOwner && direct && (
                      <button
                        onClick={() => setEditSettlement(s)}
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold hover-lift shrink-0"
                        style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                      >
                        {t("pay.editExpenses")}
                      </button>
                    )}
                    {canCancel(s) && (
                      <button
                        onClick={() => setCancelS(s)}
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold hover-lift shrink-0 ml-auto"
                        style={{ background: "rgba(255,90,77,0.12)", color: "var(--coral)" }}
                      >
                        {t("pay.cancelPayment")}
                      </button>
                    )}
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
      {explain && (
        <BalanceExplainer group={group} memberId={explain} onClose={() => setExplain(null)} />
      )}
      {explainTr && (
        <TransferExplainer
          group={group}
          from={explainTr.from}
          to={explainTr.to}
          amount={explainTr.amount}
          onClose={() => setExplainTr(null)}
          onExplainMember={(id) => setExplain(id)}
        />
      )}
      {mark && (
        <MarkPaidModal
          group={group}
          from={mark.from}
          to={mark.to}
          amount={mark.amount}
          payer={mark.confirmReceipt ? mark.from : group.meId}
          confirmReceipt={mark.confirmReceipt}
          coverable={coverableFor(mark.to, mark.from)}
          onClose={() => setMark(null)}
        />
      )}
      {editSettlement && (
        <EditPaymentExpensesModal
          group={group}
          settlement={editSettlement}
          onClose={() => setEditSettlement(null)}
        />
      )}
      {cancelS && (
        <ConfirmModal
          title={t("pay.cancelTitle")}
          message={t("pay.cancelMsg", { from: name(cancelS.from), to: name(cancelS.to), amt: money(cancelS.amount) })}
          confirmLabel={t("pay.cancelPayment")}
          onConfirm={() => removeSettlement(group.id, cancelS.id)}
          onClose={() => setCancelS(null)}
        />
      )}
      </div>
    </section>
  );
}
