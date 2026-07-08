import { useMemo, useState } from "react";
import type { Group, Settlement } from "../lib/types";
import { updateGroup } from "../lib/store";
import { expenseDebtsBetween } from "../lib/split";
import { money } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** Solo el dueño del grupo puede reasignar qué gastos cubre un pago YA
 *  confirmado (p. ej. si al marcarlo no se seleccionó nada, o hubo un error). */
export function EditPaymentExpensesModal({
  group,
  settlement,
  onClose,
}: {
  group: Group;
  settlement: Settlement;
  onClose: () => void;
}) {
  const t = useT();
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  const debts = useMemo(
    () =>
      expenseDebtsBetween(
        group.members,
        group.expenses,
        group.settlements ?? [],
        settlement.from,
        settlement.to,
        settlement.id
      ),
    [group.members, group.expenses, group.settlements, settlement.from, settlement.to, settlement.id]
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(settlement.expenseIds ?? []));
  const pickedTotal =
    Math.round(debts.filter((d) => selected.has(d.expenseId)).reduce((s, d) => s + d.amount, 0) * 100) / 100;
  const diff = Math.round((pickedTotal - settlement.amount) * 100) / 100;
  const matches = Math.abs(diff) < 0.01;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    const expenseIds = [...selected];
    updateGroup(group.id, (g) => ({
      ...g,
      settlements: (g.settlements ?? []).map((s) =>
        s.id === settlement.id ? { ...s, expenseIds: expenseIds.length ? expenseIds : undefined } : s
      ),
    }));
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-1">{t("pay.editExpensesTitle")}</h3>
        <p className="text-sm text-muted mb-4">
          {t("pay.markDesc", { amt: money(settlement.amount, group.currency), to: name(settlement.to) })}
        </p>

        {debts.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">{t("filter.none")}</div>
        ) : (
          <div className="glass rounded-2xl p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
            {debts.map((d) => {
              const on = selected.has(d.expenseId);
              return (
                <button
                  key={d.expenseId}
                  onClick={() => toggle(d.expenseId)}
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
        )}

        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-muted">{t("pay.selectedTotal")}</span>
          <span className="font-mono font-bold">{money(pickedTotal, group.currency)}</span>
        </div>
        <div
          className="flex items-center gap-1.5 mt-1 text-xs"
          style={{ color: matches ? "#0A8B5E" : "var(--amber)" }}
        >
          <Icon name={matches ? "check" : "clock"} size={13} />
          {matches
            ? t("pay.matchesPaid", { amt: money(settlement.amount, group.currency) })
            : diff > 0
            ? t("pay.overPaid", { amt: money(diff, group.currency) })
            : t("pay.underPaid", { amt: money(-diff, group.currency) })}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={save} className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift">
            {t("common.save")}
          </button>
          <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
