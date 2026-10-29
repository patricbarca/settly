import { useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { addExpense, deleteExpense, updateGroup, useGroups } from "../lib/store";
import { makeNotif } from "../lib/notifications";
import { makeActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { money, uid } from "../lib/format";
import { resolveToCode } from "../lib/currencies";
import { useArchivedGroups } from "../lib/archivedGroups";
import type { Category, Expense, Group } from "../lib/types";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { initialSplit } from "../lib/defaultSplit";

/** Pasa un gasto del grupo Personal a un grupo compartido: lo pagaste tú y se
 *  reparte a partes iguales entre quienes elijas. Se borra del Personal. */
export function MoveToGroupModal({ personal, expense, onClose }: { personal: Group; expense: Expense; onClose: () => void }) {
  const t = useT();
  const groups = useGroups();
  const { archived } = useArchivedGroups();
  const options = useMemo(
    () => groups.filter((g) => !g.personal && !g.archived && !archived.has(g.id) && g.meId),
    [groups, archived],
  );
  const [gid, setGid] = useState(options[0]?.id ?? "");
  const target = options.find((g) => g.id === gid);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const cur = resolveToCode(expense.currency ?? personal.currency);

  function draftFor(g: Group): ExpenseDraft {
    return {
      label: expense.label,
      amount: String(expense.amount),
      payerId: g.meId,
      multiPay: false,
      payments: {},
      ...initialSplit(g),
      category: expense.category as Category,
      allowEdits: false,
      date: expense.date,
      ...(expense.receiptPath ? { receiptPath: expense.receiptPath } : {}),
    };
  }

  function move(d: ExpenseDraft) {
    if (!target) return;
    const { payerId, payments, splits } = draftToExpenseFields(d);
    const amount = Number(d.amount) || 0;
    const label = d.label.trim();
    const meName = target.members.find((m) => m.id === target.meId)?.name ?? "?";
    const other = cur !== resolveToCode(target.currency);
    if (other && !target.multiCurrency) updateGroup(target.id, (g) => ({ ...g, multiCurrency: true }));
    addExpense(
      target.id,
      {
        id: uid(),
        label,
        amount,
        payerId,
        payments,
        participantIds: d.participantIds,
        splits,
        category: d.category,
        date: d.date || expense.date,
        createdBy: target.meId,
        allowEdits: d.allowEdits ?? false,
        ...(d.receiptPath ? { receiptPath: d.receiptPath } : {}),
        ...(other ? { currency: cur } : {}),
      },
      {
        notifAdd: makeNotif({ type: "expense_added", actorId: target.meId, actorName: meName, label, amount }),
        activity: makeActivity({ type: "expense_added", actorId: target.meId, actorName: meName, label, amount }),
      },
    );
    notifyGroup(target.id, target.name, t("notif.expense_added", { name: meName, label, amt: money(amount, cur) }), "expenses");
    deleteExpense(personal.id, expense.id);
    haptic("success");
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 anim-pop max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold">{t("move.title")}</h3>
          <button onClick={onClose} className="glass rounded-full p-1.5" aria-label={t("common.close")}><Icon name="close" size={16} /></button>
        </div>
        <p className="text-sm text-muted mt-1">{expense.label} · {money(expense.amount, cur)}</p>

        {step === "form" && target ? (
          <div className="mt-3">
            <p className="text-xs text-muted mb-2">{t("move.to", { g: target.name })}</p>
            <ExpenseForm
              key={target.id}
              group={target}
              initial={draftFor(target)}
              onSave={move}
              onCancel={() => setStep("pick")}
              submitLabel={t("move.cta", { g: target.name })}
              amountCurrency={cur !== resolveToCode(target.currency) ? cur : undefined}
            />
          </div>
        ) : !options.length ? (
          <p className="text-sm mt-4">{t("move.none")}</p>
        ) : (
          <>
            <label className="text-xs font-semibold text-muted block mt-4">{t("move.group")}</label>
            <select value={gid} onChange={(e) => setGid(e.target.value)} className="glass rounded-xl px-3 py-2 text-sm w-full min-w-0 mt-1">
              {options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button disabled={!target} onClick={() => setStep("form")} className="w-full rounded-2xl py-3 text-sm font-semibold text-white mt-4 disabled:opacity-40" style={{ background: "var(--teal)" }}>
              {t("move.next")}
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}
