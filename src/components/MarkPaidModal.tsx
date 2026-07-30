import { useMemo, useState, type ChangeEvent } from "react";
import type { Group } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uid, money } from "../lib/format";
import { computeSettle, expenseDebtsBetween, fifoExpenseIdsForAmount } from "../lib/split";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function MarkPaidModal({
  group,
  from,
  to,
  amount,
  payer = from,
  coverable = [],
  confirmReceipt = false,
  onClose,
}: {
  group: Group;
  from: string; // deudor cuyo saldo se salda
  to: string;
  amount: number;
  /** Quien REALMENTE pone el dinero. Si difiere de `from`, es un pago "por otro"
   *  y se guarda como `settledBy`. Por defecto = el propio deudor. */
  payer?: string;
  /** Otras deudas hacia el mismo acreedor que este pagador puede cubrir en el
   *  mismo pago (p. ej. pagar también lo de su pareja). Vacío = solo lo propio. */
  coverable?: { from: string; amount: number }[];
  /** Modo acreedor: "X me pagó". El pago se registra ya CONFIRMADO (yo, que
   *  cobro, doy fe de haberlo recibido) y no lleva `settledBy` (pagó el deudor). */
  confirmReceipt?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const onBehalf = payer !== from;
  const status = confirmReceipt ? ("confirmed" as const) : ("pending" as const);
  const max = Math.round(amount * 100) / 100;
  const [amt, setAmt] = useState(String(max));
  const [proof, setProof] = useState<string | undefined>();
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  // Miembros que elijo cubrir además de lo mío (se saldan enteros hacia `to`).
  const [covered, setCovered] = useState<Set<string>>(new Set());
  function toggleCovered(id: string) {
    setCovered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const coveredTotal =
    Math.round(coverable.filter((c) => covered.has(c.from)).reduce((s, c) => s + c.amount, 0) * 100) / 100;

  // Selección por gasto SOLO en modo Directo: ahí cada transferencia SÍ
  // corresponde a gastos reales compartidos entre estas dos personas, así que
  // se puede dejar elegir cuáles saldar. En modo Simplificado la transferencia
  // es una optimización agregada y neteada (puede no corresponder a ningún
  // gasto real con ESTA persona en concreto), por lo que mostrar una lista de
  // gastos confundía: aparecían los mismos gastos para acreedores distintos y
  // el total no cuadraba con lo adeudado. En Simplificado solo se paga el monto
  // neto que se le debe a esta persona (con opción de pago parcial).
  const direct = group.simplifyDebts === false;
  const debts = useMemo(
    () =>
      direct
        ? expenseDebtsBetween(group.members, group.expenses, group.settlements ?? [], from, to)
        : [],
    [direct, group.members, group.expenses, group.settlements, from, to]
  );
  // Preselección (solo Directo): todo lo que compone la deuda con esta persona.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(debts.map((d) => d.expenseId)));
  const usingPicker = direct && debts.length > 0;

  // Monto a pagar POR gasto (editable). Por defecto = el pendiente de cada gasto
  // (100%), pero el pagador puede bajarlo para pagar solo una parte (ej. $1000
  // de $2000). El máximo por gasto es su pendiente (no se puede pagar de más).
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(debts.map((d) => [d.expenseId, String(d.amount)]))
  );
  // Por defecto se paga el monto COMPLETO de cada gasto (solo lectura); el botón
  // de lápiz habilita el input para pagar una parte.
  const [editing, setEditing] = useState<Set<string>>(new Set());
  function toggleEdit(id: string) {
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const debtById = useMemo(
    () => Object.fromEntries(debts.map((d) => [d.expenseId, d])),
    [debts]
  );
  /** Monto válido (clamp 0..pendiente) que se pagará de un gasto. */
  function amtFor(id: string): number {
    const cap = debtById[id]?.amount ?? 0;
    const raw = Number(amounts[id] ?? cap);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.round(Math.min(raw, cap) * 100) / 100;
  }

  function toggleExpense(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pickedTotal = Math.round(debts.filter((d) => selected.has(d.expenseId)).reduce((s, d) => s + amtFor(d.expenseId), 0) * 100) / 100;

  // Si el usuario cubre TODOS los gastos al 100%, es un pago total: registramos
  // exactamente lo adeudado (`max`), no la suma de las partes por gasto. Cada
  // parte se redondea a céntimos y su suma puede quedar unos céntimos por debajo
  // del saldo real → sin esto quedaban restos tipo $0.10 sin saldar.
  const allFull =
    usingPicker &&
    debts.length > 0 &&
    debts.every((d) => selected.has(d.expenseId) && amtFor(d.expenseId) >= d.amount - 0.005);

  // Monto a registrar: la suma de los gastos elegidos, PERO nunca más de lo que
  // realmente le debes a esta persona (`max`). En modo Simplificado la deuda
  // está neteada entre varias personas, así que la suma bruta de tus gastos
  // pendientes puede superar lo que le debes a ESTE acreedor — sin este tope se
  // registraría un pago de más. Si no hay gastos (caso borde) se usa el monto
  // escrito a mano.
  const value = usingPicker
    ? (allFull ? max : Math.min(pickedTotal, max))
    : Math.min(Math.max(0, Number(amt) || 0), max);
  const valid = value > 0.005;
  const remaining = Math.round((max - value) * 100) / 100;
  // La selección supera lo adeudado (típico en Simplificado): se registrará
  // solo `max`, y lo avisamos para que el usuario no se confunda.
  const capped = usingPicker && pickedTotal > max + 0.005;

  // Deuda REAL pendiente del deudor (`from`) con TODO el grupo: computeSettle ya
  // descuenta los pagos confirmados. Si lo que se va a registrar supera esa
  // deuda, casi siempre significa que ya se saldó por otra vía — típicamente en
  // modo Simplificado, donde el gasto ya venía incluido/neteado en un pago a
  // otra persona (el "hub"). Registrarlo igual duplica dinero (fue justo lo que
  // pasó con el fuel: pagado a Felipe directo Y dentro del pago a Patric). Aviso
  // NO bloqueante: hay casos legítimos (redondeos, deuda recién añadida).
  const netFrom = useMemo(
    () => computeSettle(group.members, group.expenses, group.settlements ?? []).net[from] || 0,
    [group.members, group.expenses, group.settlements, from]
  );
  const remainingDebt = Math.max(0, Math.round(-netFrom * 100) / 100);
  const overpaying = value > remainingDebt + 0.01;

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setProof(String(r.result));
    r.readAsDataURL(f);
  }

  function confirm() {
    if (!valid) return;
    const paidAmt = Math.round(value * 100) / 100;
    // Desglose por gasto (parcial o total) + los cubiertos ENTEROS para el
    // indicador "pagado" del listado.
    const picks = usingPicker
      ? debts
          .filter((d) => selected.has(d.expenseId))
          .map((d) => ({ expenseId: d.expenseId, amount: amtFor(d.expenseId) }))
          .filter((p) => p.amount > 0.005)
      : [];
    // Directo: los gastos cubiertos enteros por la selección. Simplificado: no
    // hay selección de gastos, así que se asignan automáticamente los gastos
    // pendientes del deudor del más antiguo al más nuevo hasta cubrir el monto
    // pagado (FIFO) — solo para el indicador "pagado" del listado de gastos.
    const fullyCovered = usingPicker
      ? picks
          .filter((p) => p.amount >= (debtById[p.expenseId]?.amount ?? 0) - 0.005)
          .map((p) => p.expenseId)
      : fifoExpenseIdsForAmount(group.members, group.expenses, group.settlements ?? [], from, paidAmt);
    const today = new Date().toISOString().slice(0, 10);
    // Deudas de OTROS que este pagador cubre en el mismo movimiento (enteras).
    // El saldo que se limpia sigue siendo el del deudor real (`from` de cada
    // settlement); `settledBy` deja constancia de quién puso el dinero.
    const coveredList = coverable.filter((c) => covered.has(c.from));
    updateGroup(group.id, (g) => {
      const newSettlements = [
        {
          id: uid(),
          from,
          to,
          amount: paidAmt,
          date: today,
          // Deudor: queda PENDIENTE hasta que el acreedor confirme. Acreedor
          // (confirmReceipt): ya CONFIRMADO. Puede ser un pago PARCIAL.
          status,
          proof,
          ...(onBehalf ? { settledBy: payer } : {}),
          ...(fullyCovered.length ? { expenseIds: fullyCovered } : {}),
          ...(picks.length ? { expensePayments: picks } : {}),
        },
        ...coveredList.map((c) => ({
          id: uid(),
          from: c.from,
          to,
          amount: c.amount,
          date: today,
          status,
          // En modo acreedor cada deudor pagó lo suyo → sin settledBy. En modo
          // pagador (cubro a otros) el dinero lo pongo yo → settledBy = payer.
          ...(confirmReceipt ? {} : { settledBy: payer }),
          expenseIds: fifoExpenseIdsForAmount(g.members, g.expenses, g.settlements ?? [], c.from, c.amount),
        })),
      ];
      // Encadena una notificación por cada deudor saldado (el mío + los cubiertos).
      let notifications = g.notifications ?? [];
      for (const s of newSettlements) {
        notifications = withNotif({ ...g, notifications }, {
          type: "payment_made",
          actorId: s.from,
          actorName: name(s.from),
          toId: to,
          toName: name(to),
          amount: s.amount,
        });
      }
      return {
        ...g,
        settlements: [...(g.settlements ?? []), ...newSettlements],
        notifications,
        activity: withActivity(g, {
          type: "payment_made",
          actorId: from,
          actorName: name(from),
          toId: to,
          toName: name(to),
          amount: paidAmt + coveredTotal,
        }),
      };
    });
    notifyGroup(
      group.id,
      group.name,
      t("notif.payment_made", { name: name(from), amt: money(paidAmt, group.currency), to: name(to) }),
      "payments"
    );
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-1">{t("pay.markTitle")}</h3>
        <p className="text-sm text-muted mb-4">
          {confirmReceipt
            ? t("pay.markDescReceipt", { who: name(from), amt: money(max, group.currency) })
            : onBehalf
            ? t("pay.markDescBehalf", { who: name(from), amt: money(max, group.currency), to: name(to) })
            : t("pay.markDesc", { amt: money(max, group.currency), to: name(to) })}
        </p>

        {usingPicker ? (
          <>
            {/* Elegir qué gastos concretos cubre este pago — en vez de un
                monto suelto, para que el total a pagar sea siempre la suma
                exacta de gastos reales y para poder marcarlos como pagados
                individualmente en el listado. En Simplificado son los propios
                gastos pendientes del deudor (no necesariamente con esta
                persona en particular). */}
            <label className="text-xs font-semibold text-muted">
              {t(direct ? "pay.whichExpenses" : "pay.whichExpensesSimplified")}
            </label>
            <div className="glass rounded-2xl p-1.5 mt-1 space-y-0.5 max-h-56 overflow-y-auto">
              {debts.map((d) => {
                const on = selected.has(d.expenseId);
                const partial = on && amtFor(d.expenseId) < d.amount - 0.005;
                return (
                  <div
                    key={d.expenseId}
                    className="rounded-xl px-2.5 py-2"
                    style={on ? { background: "var(--surface-soft)" } : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => toggleExpense(d.expenseId)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover-lift"
                      >
                        <span
                          className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            background: on ? "var(--teal)" : "transparent",
                            border: on ? "none" : "1.5px solid var(--line)",
                            color: "#fff",
                          }}
                        >
                          {on && <Icon name="check" size={12} />}
                        </span>
                        <span className="text-sm flex-1 min-w-0 truncate">{d.label || "—"}</span>
                      </button>
                      {on && editing.has(d.expenseId) ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            value={amounts[d.expenseId] ?? String(d.amount)}
                            onChange={(e) => setAmounts((p) => ({ ...p, [d.expenseId]: e.target.value }))}
                            inputMode="decimal"
                            autoFocus
                            className="glass rounded-lg px-2 py-1 text-right text-sm font-mono w-20"
                          />
                          <span className="text-[10px] text-muted shrink-0">/ {money(d.amount, group.currency)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-sm font-mono font-semibold">{money(amtFor(d.expenseId), group.currency)}</span>
                          {on && (
                            <button
                              onClick={() => toggleEdit(d.expenseId)}
                              className="text-muted hover-lift p-0.5"
                              aria-label={t("common.edit")}
                            >
                              <Icon name="edit" size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {partial && (
                      <p className="text-[10px] text-muted mt-1 ml-7">{t("pay.partialOf", { total: money(d.amount, group.currency) })}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-muted">{t("pay.selectedTotal")}</span>
              <span className="font-mono font-bold">{money(value, group.currency)}</span>
            </div>
            {capped && (
              <p className="text-[11px] text-muted mt-1.5">
                {t("pay.cappedNote", { amt: money(max, group.currency), to: name(to) })}
              </p>
            )}
          </>
        ) : (
          <>
            {/* Monto pagado (permite pago parcial) */}
            <label className="text-xs font-semibold text-muted">{t("pay.amountPaid")}</label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max={max}
                step="0.01"
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
                className="glass rounded-xl px-3 py-2.5 text-sm flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => setAmt(String(max))}
                className="glass rounded-xl px-3 text-xs font-semibold text-muted hover-lift shrink-0"
              >
                {t("pay.full")}
              </button>
            </div>
            {valid && remaining > 0.005 && (
              <div className="text-[11px] text-muted mt-1.5">
                {t("pay.remaining", { amt: money(remaining, group.currency) })}
              </div>
            )}
          </>
        )}

        {coverable.length > 0 && (
          <div className="mt-4">
            <label className="text-xs font-semibold text-muted">
              {confirmReceipt ? t("pay.alsoPaidMe") : t("pay.coverOthers", { to: name(to) })}
            </label>
            <div className="glass rounded-2xl p-1.5 mt-1 space-y-0.5">
              {coverable.map((c) => {
                const on = covered.has(c.from);
                return (
                  <button
                    key={c.from}
                    onClick={() => toggleCovered(c.from)}
                    className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover-lift"
                    style={on ? { background: "var(--surface-soft)" } : undefined}
                  >
                    <span
                      className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: on ? "var(--teal)" : "transparent",
                        border: on ? "none" : "1.5px solid var(--line)",
                        color: "#fff",
                      }}
                    >
                      {on && <Icon name="check" size={12} />}
                    </span>
                    <span className="text-sm flex-1 min-w-0 truncate">{name(c.from)}</span>
                    <span className="text-sm font-mono font-semibold">{money(c.amount, group.currency)}</span>
                  </button>
                );
              })}
            </div>
            {coveredTotal > 0 && (
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="font-semibold">{t("pay.totalToTransfer")}</span>
                <span className="font-mono font-bold">{money(value + coveredTotal, group.currency)}</span>
              </div>
            )}
          </div>
        )}

        {overpaying && (
          <div
            className="rounded-2xl p-3 mt-4 text-[12px] leading-snug flex items-start gap-2"
            style={{ background: "rgba(232,146,12,0.12)", border: "1px solid rgba(232,146,12,0.35)", color: "#B5730A" }}
          >
            <Icon name="clock" size={15} className="mt-0.5 shrink-0" />
            <span>
              {remainingDebt < 0.01
                ? t("pay.overpaySettled", { who: name(from), to: name(to) })
                : t("pay.overpayWarn", { who: name(from), amt: money(remainingDebt, group.currency), to: name(to) })}
            </span>
          </div>
        )}

        <label className="text-xs font-semibold text-muted block mt-4">{t("pay.attach")}</label>
        <label className="glass rounded-xl px-3 py-3 text-sm w-full mt-1 flex items-center justify-center gap-2 cursor-pointer text-muted hover-lift">
          <Icon name="paperclip" size={16} />
          {proof && <Icon name="check" size={16} style={{ color: "#0A8B5E" }} />}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
        {proof && <img src={proof} alt="" className="max-h-32 rounded-xl mt-2 mx-auto" />}

        <div className="flex gap-2 mt-4">
          <button
            onClick={confirm}
            disabled={!valid}
            className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-40"
          >
            {confirmReceipt ? t("pay.confirmReceived") : t("pay.confirmPay")}
          </button>
          <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
