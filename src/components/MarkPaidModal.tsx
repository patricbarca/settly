import { useMemo, useState, type ChangeEvent } from "react";
import type { Group } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uid, money } from "../lib/format";
import { expenseDebtsBetween, myPendingExpenses } from "../lib/split";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function MarkPaidModal({
  group,
  from,
  to,
  amount,
  onClose,
}: {
  group: Group;
  from: string;
  to: string;
  amount: number;
  onClose: () => void;
}) {
  const t = useT();
  const max = Math.round(amount * 100) / 100;
  const [amt, setAmt] = useState(String(max));
  const [proof, setProof] = useState<string | undefined>();
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  // Selección por gasto: en Directo son los gastos reales compartidos entre
  // estas dos personas; en Simplificado (la transferencia es una optimización
  // agregada que puede no corresponder a ningún gasto real con ESTA persona)
  // se listan los propios gastos pendientes del deudor sin importar quién los
  // pagó — así el monto a pagar siempre es una suma exacta de gastos reales,
  // nunca un número escrito a mano que podría no cuadrar con nada.
  const direct = group.simplifyDebts === false;
  const debts = useMemo(
    () =>
      direct
        ? expenseDebtsBetween(group.members, group.expenses, group.settlements ?? [], from, to)
        : myPendingExpenses(group.members, group.expenses, group.settlements ?? [], from),
    [direct, group.members, group.expenses, group.settlements, from, to]
  );
  // Preselección: en Directo, todo lo que compone la deuda con esta persona.
  // En Simplificado, los más antiguos hasta cubrir el monto sugerido (FIFO) —
  // el usuario puede ajustar la selección libremente después.
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (direct) return new Set(debts.map((d) => d.expenseId));
    let remaining = amount;
    const ids: string[] = [];
    for (const d of debts) {
      if (d.amount <= remaining + 0.005) {
        ids.push(d.expenseId);
        remaining -= d.amount;
      } else break;
    }
    return new Set(ids);
  });
  const usingPicker = debts.length > 0;

  function toggleExpense(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pickedTotal = Math.round(debts.filter((d) => selected.has(d.expenseId)).reduce((s, d) => s + d.amount, 0) * 100) / 100;

  // Monto a registrar: la suma de los gastos elegidos, PERO nunca más de lo que
  // realmente le debes a esta persona (`max`). En modo Simplificado la deuda
  // está neteada entre varias personas, así que la suma bruta de tus gastos
  // pendientes puede superar lo que le debes a ESTE acreedor — sin este tope se
  // registraría un pago de más. Si no hay gastos (caso borde) se usa el monto
  // escrito a mano.
  const value = usingPicker
    ? Math.min(pickedTotal, max)
    : Math.min(Math.max(0, Number(amt) || 0), max);
  const valid = value > 0.005;
  const remaining = Math.round((max - value) * 100) / 100;
  // La selección supera lo adeudado (típico en Simplificado): se registrará
  // solo `max`, y lo avisamos para que el usuario no se confunda.
  const capped = usingPicker && pickedTotal > max + 0.005;

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
    updateGroup(group.id, (g) => ({
      ...g,
      settlements: [
        ...(g.settlements ?? []),
        {
          id: uid(),
          from,
          to,
          amount: paidAmt,
          date: new Date().toISOString().slice(0, 10),
          // Lo marca el deudor ("ya pagué") → queda PENDIENTE hasta que quien
          // cobra lo confirme o lo rechace. Puede ser un pago PARCIAL.
          status: "pending",
          proof,
          ...(usingPicker ? { expenseIds: [...selected] } : {}),
        },
      ],
      notifications: withNotif(g, {
        type: "payment_made",
        actorId: from,
        actorName: name(from),
        toId: to,
        toName: name(to),
        amount: paidAmt,
      }),
      activity: withActivity(g, {
        type: "payment_made",
        actorId: from,
        actorName: name(from),
        toId: to,
        toName: name(to),
        amount: paidAmt,
      }),
    }));
    notifyGroup(
      group.id,
      group.name,
      t("notif.payment_made", { name: name(from), amt: money(paidAmt, group.currency), to: name(to) })
    );
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-1">{t("pay.markTitle")}</h3>
        <p className="text-sm text-muted mb-4">
          {t("pay.markDesc", { amt: money(max, group.currency), to: name(to) })}
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
                return (
                  <button
                    key={d.expenseId}
                    onClick={() => toggleExpense(d.expenseId)}
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
                    <span className="text-sm flex-1 min-w-0 truncate">{d.label || "—"}</span>
                    <span className="text-sm font-mono font-semibold shrink-0">{money(d.amount, group.currency)}</span>
                  </button>
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
            {t("pay.confirmPay")}
          </button>
          <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
