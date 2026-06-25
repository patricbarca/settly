import { useState, useMemo } from "react";
import type { Group, Category } from "../lib/types";
import { catOf } from "../lib/types";
import { updateGroup } from "../lib/store";
import { shareFor } from "../lib/split";
import { money, fmtDate, memberLabels } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { monthKey, monthsWithExpenses, monthLabel } from "../lib/report";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { ConfirmModal } from "./ConfirmModal";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { RecurringList } from "./RecurringList";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";

export function ExpenseList({ group }: { group: Group }) {
  const t = useT();
  const lang = useLang();
  const ids = group.members.map((m) => m.id);
  const [editId, setEditId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Gasto pendiente de confirmar su eliminación (evita borrados accidentales).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  // Iniciales + color únicos por grupo (evita que dos personas se vean iguales).
  const labels = memberLabels(group.members);

  // Filtros de la sección de gastos: por pagador, participante, categoría y mes.
  const [showFilters, setShowFilters] = useState(false);
  const [fPayer, setFPayer] = useState<string | null>(null);
  const [fPart, setFPart] = useState<string | null>(null);
  const [fCat, setFCat] = useState<Category | null>(null);
  const [fMonth, setFMonth] = useState<string | null>(null);
  const activeFilters = (fPayer ? 1 : 0) + (fPart ? 1 : 0) + (fCat ? 1 : 0) + (fMonth ? 1 : 0);

  // ¿Quién pagó este gasto? (incluye multi-pagador). ¿Quién comparte el coste?
  function paidBy(e: Group["expenses"][number], pid: string): boolean {
    return e.payerId === pid || !!e.payments?.some((p) => p.memberId === pid);
  }
  function sharedBy(e: Group["expenses"][number], pid: string): boolean {
    const parts = e.participantIds.length ? e.participantIds : ids;
    return parts.includes(pid);
  }

  // Opciones disponibles, derivadas de los gastos existentes.
  const payerOptions = useMemo(
    () => group.members.filter((m) => group.expenses.some((e) => paidBy(e, m.id))),
    [group.members, group.expenses]
  );
  const partOptions = useMemo(
    () => group.members.filter((m) => group.expenses.some((e) => sharedBy(e, m.id))),
    [group.members, group.expenses]
  );
  const catOptions = useMemo(() => {
    const set = new Set<Category>();
    for (const e of group.expenses) set.add(e.category);
    return [...set];
  }, [group.expenses]);
  const monthOptions = useMemo(() => monthsWithExpenses(group), [group]);

  const visible = group.expenses.filter(
    (e) =>
      (!fPayer || paidBy(e, fPayer)) &&
      (!fPart || sharedBy(e, fPart)) &&
      (!fCat || e.category === fCat) &&
      (!fMonth || monthKey(e.date) === fMonth)
  );

  function clearFilters() {
    setFPayer(null);
    setFPart(null);
    setFCat(null);
    setFMonth(null);
  }

  function remove(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.filter((e) => e.id !== id),
      // Limpia cualquier aviso de "eliminación solicitada" de este gasto.
      notifications: (g.notifications ?? []).filter(
        (n) => !(n.type === "delete_requested" && n.expenseId === id)
      ),
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
    if (!exp || exp.deleteRequested) return;
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.map((e) => (e.id === id ? { ...e, deleteRequested: true } : e)),
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
      // Solicitud de revisión: anónima (sin actorId) por diseño. Guardamos
      // expenseId para poder cancelarla después con precisión.
      notifications: withNotif(g, { type: "review_requested", label: exp.label, expenseId: id }),
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
  // Cancelar una solicitud propia (la pulsé por error): quita el flag y el aviso.
  function cancelReview(id: string) {
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.map((e) => (e.id === id ? { ...e, reviewRequested: false } : e)),
      notifications: (g.notifications ?? []).filter(
        (n) => !(n.type === "review_requested" && n.expenseId === id)
      ),
    }));
  }
  function cancelDelete(id: string) {
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: g.expenses.map((e) => (e.id === id ? { ...e, deleteRequested: false } : e)),
      notifications: (g.notifications ?? []).filter(
        (n) => !(n.type === "delete_requested" && n.expenseId === id)
      ),
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
      <div className="flex items-center justify-between px-1">
        <h3 className="font-display text-lg font-bold">{t("exp.title")}</h3>
        {group.expenses.length > 0 && (
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="glass rounded-full px-3 py-1 text-xs hover-lift inline-flex items-center gap-1.5"
            style={activeFilters ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
          >
            <Icon name="filter" size={13} />
            {t("filter.title")}
            {activeFilters > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-white/25 inline-flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        )}
      </div>
      <RecurringList group={group} />

      {showFilters && group.expenses.length > 0 && (
        <div className="glass rounded-3xl p-3 space-y-3 anim-pop">
          {/* Pagador: en qué gastos puso el dinero (lo que le deben) */}
          {payerOptions.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">{t("filter.payer")}</div>
              <div className="flex gap-1.5 flex-wrap">
                {payerOptions.map((m) => {
                  const on = fPayer === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setFPayer(on ? null : m.id)}
                      className={`rounded-full pl-1 pr-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 ${on ? "" : "glass text-muted"}`}
                      style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                    >
                      <span
                        className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                        style={{ background: (labels[m.id]?.color ?? "#888") + "22", color: labels[m.id]?.color ?? "#888" }}
                      >
                        {labels[m.id]?.label ?? "?"}
                      </span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Participante: en qué gastos comparte el coste (lo que tiene que pagar) */}
          {partOptions.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">{t("filter.participant")}</div>
              <div className="flex gap-1.5 flex-wrap">
                {partOptions.map((m) => {
                  const on = fPart === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setFPart(on ? null : m.id)}
                      className={`rounded-full pl-1 pr-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 ${on ? "" : "glass text-muted"}`}
                      style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                    >
                      <span
                        className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                        style={{ background: (labels[m.id]?.color ?? "#888") + "22", color: labels[m.id]?.color ?? "#888" }}
                      >
                        {labels[m.id]?.label ?? "?"}
                      </span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Categoría */}
          {catOptions.length > 1 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">{t("filter.category")}</div>
              <div className="flex gap-1.5 flex-wrap">
                {catOptions.map((cat) => {
                  const on = fCat === cat;
                  const c = catOf(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => setFCat(on ? null : cat)}
                      className={`rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 ${on ? "" : "glass text-muted"}`}
                      style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                    >
                      <Icon name={c.icon} size={13} /> {t(`cat.${cat}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Mes */}
          {monthOptions.length > 1 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">{t("filter.month")}</div>
              <div className="flex gap-1.5 flex-wrap">
                {monthOptions.map((mk) => {
                  const on = fMonth === mk;
                  return (
                    <button
                      key={mk}
                      onClick={() => setFMonth(on ? null : mk)}
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${on ? "" : "glass text-muted"}`}
                      style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                    >
                      {monthLabel(mk, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {activeFilters > 0 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted">{t("filter.count", { n: visible.length, total: group.expenses.length })}</span>
              <button onClick={clearFilters} className="text-xs font-medium lk" style={{ color: "var(--teal)" }}>
                {t("filter.clear")}
              </button>
            </div>
          )}
        </div>
      )}

      {group.expenses.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center text-muted">{t("exp.empty")}</div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center text-muted">{t("filter.none")}</div>
      ) : visible.map((e) => {
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
                {/* Burbujas con las iniciales de quienes participan en el gasto,
                    visibles sin abrirlo. */}
                {participants.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1 mt-1.5">
                    {participants.slice(0, 7).map((id) => (
                      <span
                        key={id}
                        title={name(id)}
                        className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                        style={{
                          background: (labels[id]?.color ?? "#888") + "22",
                          color: labels[id]?.color ?? "#888",
                          boxShadow: "0 0 0 1.5px var(--surface)",
                        }}
                      >
                        {labels[id]?.label ?? "?"}
                      </span>
                    ))}
                    {participants.length > 7 && (
                      <span className="text-[10px] text-muted ml-0.5">+{participants.length - 7}</span>
                    )}
                  </div>
                )}
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
                            style={{ background: (labels[id]?.color ?? "#888") + "22", color: labels[id]?.color ?? "#888" }}
                          >
                            {labels[id]?.label ?? "?"}
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
                    ) : (
                      <button
                        onClick={() => cancelReview(e.id)}
                        title={t("exp.tapToCancel")}
                        className="rounded-full px-3 py-1 text-xs font-semibold hover-lift inline-flex items-center gap-1"
                        style={{ background: "rgba(232,146,12,0.16)", color: "var(--amber)" }}
                      >
                        <Icon name="flag" size={13} /> {t("exp.reviewRequested")} <Icon name="close" size={12} />
                      </button>
                    )}
                    {e.createdBy && e.createdBy !== group.meId ? (
                      // No soy el creador: puedo pedir que lo elimine, o ver que ya lo pedí.
                      e.deleteRequested ? (
                        <button
                          onClick={() => cancelDelete(e.id)}
                          title={t("exp.tapToCancel")}
                          className="rounded-full px-3 py-1 text-xs font-semibold hover-lift inline-flex items-center gap-1"
                          style={{ background: "rgba(232,146,12,0.16)", color: "var(--amber)" }}
                        >
                          <Icon name="clock" size={13} /> {t("exp.deletePending")} <Icon name="close" size={12} />
                        </button>
                      ) : (
                        <button
                          onClick={() => requestDelete(e.id)}
                          className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                        >
                          <Icon name="trash" size={13} /> {t("exp.requestDelete")}
                        </button>
                      )
                    ) : e.deleteRequested ? (
                      // Soy el creador (o gasto sin autor) y alguien pidió eliminarlo:
                      // el botón se resalta para aprobar la eliminación (como "Revisado").
                      <button
                        onClick={() => setConfirmId(e.id)}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift inline-flex items-center gap-1"
                        style={{ background: "var(--coral)" }}
                      >
                        <Icon name="trash" size={13} /> {t("exp.deleteApprove")}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmId(e.id)}
                        className="glass rounded-full px-3 py-1 text-xs hover-lift lk-danger text-muted inline-flex items-center gap-1"
                      >
                        <Icon name="trash" size={13} /> {t("common.delete")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {confirmId && (
        <ConfirmModal
          title={t("exp.confirmDeleteTitle")}
          message={t("exp.confirmDeleteMsg", {
            label: group.expenses.find((x) => x.id === confirmId)?.label ?? "",
          })}
          onConfirm={() => remove(confirmId)}
          onClose={() => setConfirmId(null)}
        />
      )}

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
