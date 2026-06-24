import { useState } from "react";
import type { Group } from "../lib/types";
import { catOf } from "../lib/types";
import { updateGroup } from "../lib/store";
import { shareFor } from "../lib/split";
import { money, fmtDate, personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { RecurringList } from "./RecurringList";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";

export function ExpenseList({ group }: { group: Group }) {
  const t = useT();
  const ids = group.members.map((m) => m.id);
  const [editId, setEditId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  function remove(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.filter((e) => e.id !== id),
      activity: withActivity(g, {
        type: "expense_deleted",
        actorId: group.meId,
        actorName: name(group.meId),
        label: exp?.label,
        amount: exp?.amount,
      }),
    }));
  }

  function requestDelete(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    if (!exp) return;
    updateGroup(group.id, (g) => ({
      ...g,
      notifications: withNotif(g, {
        type: "delete_requested",
        actorId: group.meId,
        actorName: name(group.meId),
        toId: exp.createdBy,
        label: exp.label,
        expenseId: id,
      }),
    }));
  }

  function approveDelete(expenseId: string, notifId: string) {
    const exp = group.expenses.find((e) => e.id === expenseId);
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.filter((e) => e.id !== expenseId),
      notifications: (g.notifications ?? []).filter((n) => n.id !== notifId),
      activity: withActivity(g, {
        type: "expense_deleted",
        actorId: group.meId,
        actorName: name(group.meId),
        label: exp?.label,
        amount: exp?.amount,
      }),
    }));
  }
  function requestReview(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    if (!exp) return;
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.map((e) => (e.id === id ? { ...e, reviewRequested: true } : e)),
      // Solicitud de revisión: anónima (sin actorId) por diseño.
      notifications: withNotif(g, { type: "review_requested", label: exp.label }),
      // En el log sí registramos quién la pidió (es tu propia actividad).
      activity: withActivity(g, {
        type: "review_requested",
        actorId: group.meId,
        actorName: name(group.meId),
        label: exp.label,
      }),
    }));
    notifyGroup(group.id, group.name, t("notif.review_requested", { label: exp.label }));
  }
  // El creador del gasto marca que ya lo revisó (resuelve la solicitud).
  function markReviewed(id: string) {
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.map((e) => (e.id === id ? { ...e, reviewRequested: false } : e)),
    }));
  }
  function saveEdit(id: string, d: ExpenseDraft) {
    const { payerId, payments, splits } = draftToExpenseFields(d);
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.map((e) =>
        e.id === id
          ? {
              ...e,
              label: d.label.trim(),
              amount: Number(d.amount) || 0,
              payerId,
              payments,
              participantIds: d.participantIds,
              category: d.category,
              splits,
            }
          : e
      ),
      activity: withActivity(g, {
        type: "expense_edited",
        actorId: group.meId,
        actorName: name(group.meId),
        label: d.label.trim(),
        amount: Number(d.amount) || 0,
      }),
    }));
    setEditId(null);
  }

  const editing = editId ? group.expenses.find((x) => x.id === editId) : null;

  return (
    <section className="space-y-2">
      <h3 className="font-display text-lg font-bold px-1">{t("exp.title")}</h3>
      <RecurringList group={group} />
      {group.expenses.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center text-muted">{t("exp.empty")}</div>
      ) : group.expenses.map((e) => {
        const c = catOf(e.category);
        const open = openId === e.id;
        const shares = shareFor(e, ids);
        const participants = (e.participantIds.length ? e.participantIds : ids).filter(
          (id) => (shares[id] || 0) > 0.001
        );
        const payerDisplay = e.payments?.length
          ? e.payments.map((p) => name(p.memberId)).join(", ")
          : name(e.payerId);
        return (
          <div key={e.id} className="glass rounded-3xl overflow-hidden hover-lift">
            <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => setOpenId(open ? null : e.id)}>
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 surface-soft text-[color:var(--ink)]">
                <Icon name={c.icon} size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate flex items-center gap-2">
                  {e.label}
                  {e.reviewRequested && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
                      style={{ background: "#E8920C22", color: "#9A6B00" }}
                    >
                      <Icon name="flag" size={11} /> {t("exp.inReview")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {t("exp.meta", { payer: payerDisplay, n: participants.length, date: fmtDate(e.date) })}
                </div>
              </div>
              <div className="text-right shrink-0 flex items-center gap-1.5">
                <span className="font-mono font-bold">{money(e.amount, group.currency)}</span>
                <Icon
                  name="chevron"
                  size={16}
                  className="text-muted transition-transform"
                  style={{ transform: open ? "rotate(180deg)" : "none" }}
                />
              </div>
            </div>

            {open && (
              <div className="px-3 pb-3 anim-pop">
                <div className="glass rounded-xl p-3">
                  <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">{t("exp.shares")}</div>
                  <div className="space-y-1">
                    {participants.map((id) => (
                      <div key={id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold"
                            style={{ background: personColor(name(id)) + "22" }}
                          >
                            {memberInitials(group.members.find((m) => m.id === id) ?? { name: name(id) })}
                          </span>
                          {name(id)}
                        </span>
                        <span className="font-mono">{money(shares[id] || 0, group.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => setEditId(e.id)}
                      className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                    >
                      <Icon name="edit" size={13} /> {t("exp.edit")}
                    </button>
                    {!e.reviewRequested ? (
                      <button
                        onClick={() => requestReview(e.id)}
                        className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                      >
                        <Icon name="flag" size={13} /> {t("exp.review")}
                      </button>
                    ) : e.createdBy === group.meId ? (
                      <button
                        onClick={() => markReviewed(e.id)}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift inline-flex items-center gap-1"
                        style={{ background: "#0A8B5E" }}
                      >
                        <Icon name="check" size={13} /> {t("exp.reviewed")}
                      </button>
                    ) : null}
                    {!e.createdBy || e.createdBy === group.meId ? (
                      <button
                        onClick={() => remove(e.id)}
                        className="glass rounded-full px-3 py-1 text-xs hover-lift lk-danger text-muted inline-flex items-center gap-1"
                      >
                        <Icon name="trash" size={13} /> {t("common.delete")}
                      </button>
                    ) : (
                      <button
                        onClick={() => requestDelete(e.id)}
                        className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                      >
                        <Icon name="trash" size={13} /> {t("exp.requestDelete")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <Overlay onClose={() => setEditId(null)}>
          <div
            className="glass-strong rounded-3xl w-full max-w-lg p-6 anim-pop max-h-[92vh] overflow-y-auto"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="font-display text-xl font-bold mb-3">{t("exp.edit")}</h3>
            <ExpenseForm
              group={group}
              initial={{
                label: editing.label,
                amount: editing.amount,
                payerId: editing.payerId,
                multiPay: !!(editing.payments?.length),
                payments: editing.payments
                  ? Object.fromEntries(editing.payments.map((p) => [p.memberId, p.amount]))
                  : {},
                participantIds: editing.participantIds,
                splitMode: editing.splits ? "exact" : "equal",
                splitValues: editing.splits ?? {},
                category: editing.category,
              }}
              onSave={(d) => saveEdit(editing.id, d)}
              onCancel={() => setEditId(null)}
            />
          </div>
        </Overlay>
      )}
    </section>
  );
}
