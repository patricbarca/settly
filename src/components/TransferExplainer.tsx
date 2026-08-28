import type { Group } from "../lib/types";
import { computeSettle, expenseDebtsBetween, settles } from "../lib/split";
import { displayName } from "../lib/format";
import { useGroupMoney } from "../lib/displayCurrency";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** Explica POR QUÉ existe una transferencia "Para saldar" (from → to). En modo
 *  Simplificado aclara que el emparejamiento minimiza transferencias y puede
 *  cambiar cuando otros pagan; en modo Directo lista los gastos concretos que la
 *  componen. Botón para abrir el desglose de la persona. Reactivo (sin estado). */
export function TransferExplainer({
  group,
  from,
  to,
  amount,
  onClose,
  onExplainMember,
}: {
  group: Group;
  from: string;
  to: string;
  amount: number;
  onClose: () => void;
  onExplainMember: (id: string) => void;
}) {
  const t = useT();
  const money = useGroupMoney(group);
  const simplified = group.simplifyDebts !== false;
  const name = (id: string) => {
    const m = group.members.find((x) => x.id === id);
    return m ? displayName(m) : "?";
  };
  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);
  const netFrom = Math.abs(net[from] || 0);
  const netTo = Math.abs(net[to] || 0);
  const settlements = group.settlements ?? [];
  const directDebts = !simplified
    ? expenseDebtsBetween(group.members, group.expenses, settlements, from, to)
    : [];
  // Suma de los gastos concretos que el modo Directo pudo atribuir.
  const listSum = Math.round(directDebts.reduce((a, d) => a + d.amount, 0) * 100) / 100;
  // Lo que 'from' ya le pagó a 'to' (pagos marcados/confirmados entre ese par).
  const paidFromTo = !simplified
    ? Math.round(
        settlements
          .filter((s) => settles(s) && s.from === from && s.to === to)
          .reduce((a, s) => a + Number(s.amount || 0), 0) * 100
      ) / 100
    : 0;
  // La lista de gastos "cuadra" con la transferencia solo si su suma ≈ el monto.
  // Cuando los pagos se hicieron por MONTOS SUELTOS (no atados a un gasto vía
  // expenseIds), la lista no cuadra (muestra la deuda bruta) → en su lugar
  // mostramos el resumen parte/pagado/restante, que sí reconcilia con el neto.
  const listReconciles = Math.abs(listSum - amount) < 0.02;
  const shareGross = Math.round((amount + paidFromTo) * 100) / 100;
  const showSummary = !simplified && !listReconciles && paidFromTo > 0.01;

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-1">{t("explainTr.title")}</h3>
        <p className="text-sm mb-4">
          <b>{name(from)}</b> <span className="text-muted">{t("bal.paysTo")}</span> <b>{name(to)}</b>{" "}
          <span className="font-mono font-bold">{money(amount)}</span>
        </p>

        {simplified ? (
          <>
            <div className="glass rounded-2xl p-3 mb-3 text-sm space-y-1.5">
              <p className="text-muted">{t("explainTr.simplifiedNote")}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted">{t("explainTr.netFrom", { name: name(from) })}</span>
                <span className="font-mono">{money(netFrom)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("explainTr.netTo", { name: name(to) })}</span>
                <span className="font-mono">{money(netTo)}</span>
              </div>
            </div>
            <div
              className="rounded-2xl p-3 mb-3 text-xs"
              style={{ background: "rgba(232,146,12,0.12)", color: "#B5730A" }}
            >
              <Icon name="clock" size={13} className="inline mr-1" />
              {t("explainTr.canChange")}
            </div>
            <p className="text-xs text-muted mb-3">{t("explainTr.directHint")}</p>
          </>
        ) : showSummary ? (
          <div className="glass rounded-2xl p-3 mb-3 text-sm space-y-1.5">
            <p className="text-muted text-xs">{t("explainTr.lumpNote")}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted">{t("explainTr.share", { name: name(from) })}</span>
              <span className="font-mono">{money(shareGross)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("explainTr.paidAlready")}</span>
              <span className="font-mono">−{money(paidFromTo)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold border-t pt-1.5" style={{ borderColor: "var(--line)" }}>
              <span>{t("explainTr.remaining")}</span>
              <span className="font-mono">{money(amount)}</span>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-3 mb-3">
            <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-2">{t("explainTr.directTitle")}</div>
            <div className="space-y-1">
              {directDebts.length === 0 ? (
                <div className="text-sm text-muted">—</div>
              ) : (
                directDebts.map((d) => (
                  <div key={d.expenseId} className="flex items-center justify-between text-sm gap-2">
                    <span className="min-w-0 truncate">{d.label}</span>
                    <span className="font-mono shrink-0">{money(d.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => { onClose(); onExplainMember(from); }}
          className="glass rounded-full px-4 py-2.5 text-sm hover-lift w-full inline-flex items-center justify-center gap-1.5 mb-2"
        >
          <Icon name="help" size={15} /> {t("explainTr.seeMember", { name: name(from) })}
        </button>
        <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift w-full inline-flex items-center justify-center gap-1.5">
          <Icon name="check" size={15} /> {t("common.close")}
        </button>
      </div>
    </Overlay>
  );
}
