import { useState, useMemo, useRef } from "react";
import type { Group, Category } from "../lib/types";
import { catOf } from "../lib/types";
import { patchExpense, deleteExpense } from "../lib/store";
import { shareFor } from "../lib/split";
import { money as rawMoney, fmtDate, memberLabels } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { useGroupMoney } from "../lib/displayCurrency";
import { fmtRate } from "../lib/fx";
import { monthKey, monthsWithExpenses, monthLabel } from "../lib/report";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { ConfirmModal } from "./ConfirmModal";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { ItemizedExpenseEditor, type ItemizedResult } from "./ItemizedExpenseEditor";
import { ReceiptButton } from "./ReceiptButton";
import { RecurringList } from "./RecurringList";
import { makeNotif } from "../lib/notifications";
import { makeActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";

export function ExpenseList({ group }: { group: Group }) {
  const t = useT();
  const lang = useLang();
  const money = useGroupMoney(group);
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

  // Estas mutaciones usan las operaciones atómicas de store.ts (RPCs que
  // parchean solo este gasto en el servidor, con lock de fila) en vez de
  // updateGroup — así dos personas tocando gastos distintos (o distintos
  // campos del mismo gasto) a la vez no se pisan el cambio.
  function remove(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    deleteExpense(group.id, id, {
      activity: makeActivity({
        type: "expense_deleted",
        actorId: group.meId,
        actorName: name(group.meId),
        label: exp?.label,
        amount: exp?.amount,
      }),
      // Limpia cualquier aviso de "eliminación solicitada" de este gasto.
      notifRemove: { type: "delete_requested", expenseId: id },
    });
  }

  function requestDelete(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    if (!exp || exp.deleteRequested) return;
    patchExpense(group.id, id, { deleteRequested: true }, {
      notifAdd: makeNotif({
        type: "delete_requested",
        actorId: group.meId,
        actorName: name(group.meId),
        toId: exp.createdBy,
        label: exp.label,
        expenseId: id,
      }),
    });
  }

  function approveDelete(expenseId: string, _notifId: string) {
    const exp = group.expenses.find((e) => e.id === expenseId);
    deleteExpense(group.id, expenseId, {
      activity: makeActivity({
        type: "expense_deleted",
        actorId: group.meId,
        actorName: name(group.meId),
        label: exp?.label,
        amount: exp?.amount,
      }),
      notifRemove: { type: "delete_requested", expenseId },
    });
  }
  function requestReview(id: string) {
    const exp = group.expenses.find((e) => e.id === id);
    if (!exp) return;
    patchExpense(group.id, id, { reviewRequested: true }, {
      // Solicitud de revisión: anónima (sin actorId) por diseño, tanto en la
      // notificación como en el log de actividad. Guardamos expenseId para
      // poder cancelarla después con precisión.
      notifAdd: makeNotif({ type: "review_requested", label: exp.label, expenseId: id }),
      activity: makeActivity({ type: "review_requested", label: exp.label }),
    });
    notifyGroup(group.id, group.name, t("notif.review_requested", { label: exp.label }));
  }
  // El creador del gasto marca que ya lo revisó (resuelve la solicitud).
  function markReviewed(id: string) {
    patchExpense(group.id, id, { reviewRequested: false });
  }
  // Cancelar una solicitud propia (la pulsé por error): quita el flag y el aviso.
  function cancelReview(id: string) {
    patchExpense(group.id, id, { reviewRequested: false }, {
      notifRemove: { type: "review_requested", expenseId: id },
    });
  }
  function cancelDelete(id: string) {
    patchExpense(group.id, id, { deleteRequested: false }, {
      notifRemove: { type: "delete_requested", expenseId: id },
    });
  }
  function saveEdit(id: string, d: ExpenseDraft) {
    const { payerId, payments, splits } = draftToExpenseFields(d);
    patchExpense(
      group.id,
      id,
      {
        label: d.label.trim(),
        amount: Number(d.amount) || 0,
        payerId,
        payments,
        participantIds: d.participantIds,
        category: d.category,
        splits,
      },
      {
        activity: makeActivity({
          type: "expense_edited",
          actorId: group.meId,
          actorName: name(group.meId),
          label: d.label.trim(),
          amount: Number(d.amount) || 0,
        }),
      }
    );
    setEditId(null);
  }
  // Guardar la edición de un gasto repartido por ítem (editor por plato).
  function saveItemizedEdit(id: string, r: ItemizedResult) {
    patchExpense(
      group.id,
      id,
      {
        label: r.label,
        amount: r.amount,
        payerId: r.payerId,
        payments: undefined,
        participantIds: r.participantIds,
        category: r.category,
        splits: r.splits,
        items: r.items,
        fees: r.fees,
        tip: r.tip,
      },
      {
        activity: makeActivity({
          type: "expense_edited",
          actorId: group.meId,
          actorName: name(group.meId),
          label: r.label,
          amount: r.amount,
        }),
      }
    );
    setEditId(null);
  }

  const editing = editId ? group.expenses.find((x) => x.id === editId) : null;

  return (
    <section className="space-y-1.5">
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
      ) : visible.map((e) => (
        <ExpenseRow
          key={e.id}
          e={e}
          group={group}
          ids={ids}
          labels={labels}
          name={name}
          money={money}
          t={t}
          open={openId === e.id}
          onToggleOpen={() => setOpenId(openId === e.id ? null : e.id)}
          onEdit={() => setEditId(e.id)}
          onRequestReview={() => requestReview(e.id)}
          onMarkReviewed={() => markReviewed(e.id)}
          onCancelReview={() => cancelReview(e.id)}
          onRequestDelete={() => requestDelete(e.id)}
          onCancelDelete={() => cancelDelete(e.id)}
          onDelete={() => setConfirmId(e.id)}
        />
      ))}

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
            {editing.items?.length ? (
              // Gasto repartido por ítem/plato → editor por ítem (igual que se ingresó).
              <ItemizedExpenseEditor
                group={group}
                initial={{
                  label: editing.label,
                  items: editing.items,
                  fees: editing.fees,
                  tip: editing.tip,
                  payerId: editing.payerId,
                  category: editing.category,
                  originalCurrency: editing.originalCurrency,
                  fxRate: editing.fxRate,
                }}
                submitLabel={t("exp.edit")}
                onSubmit={(r) => saveItemizedEdit(editing.id, r)}
                onCancel={() => setEditId(null)}
              />
            ) : (
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
            )}
          </div>
        </Overlay>
      )}
    </section>
  );
}

// Ancho revelado por el swipe (botón "Eliminar" rojo detrás de la fila).
const SWIPE_W = 76;

/** Fila de gasto con swipe-to-delete: deslizar a la izquierda revela un botón
 *  rojo de eliminar, pero SOLO si el gasto lo agregué yo (`createdBy`) — para
 *  los de otras personas el swipe no hace nada (usan el flujo de "pedir
 *  eliminación" dentro del detalle, igual que antes). */
function ExpenseRow({
  e,
  group,
  ids,
  labels,
  name,
  money,
  t,
  open,
  onToggleOpen,
  onEdit,
  onRequestReview,
  onMarkReviewed,
  onCancelReview,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  e: Group["expenses"][number];
  group: Group;
  ids: string[];
  labels: ReturnType<typeof memberLabels>;
  name: (id: string) => string;
  money: (n: number) => string;
  t: ReturnType<typeof useT>;
  open: boolean;
  onToggleOpen: () => void;
  onEdit: () => void;
  onRequestReview: () => void;
  onMarkReviewed: () => void;
  onCancelReview: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const c = catOf(e.category);
  const shares = shareFor(e, ids);
  const participants = (e.participantIds.length ? e.participantIds : ids).filter(
    (id) => (shares[id] || 0) > 0.001
  );
  const payerDisplay = e.payments?.length
    ? e.payments.map((p) => name(p.memberId)).join(", ")
    : name(e.payerId);
  // Mismo criterio que el botón de eliminar en el detalle: sin autor (gastos
  // antiguos) o autor = yo → es "mío", puedo eliminarlo directo.
  const isMine = !e.createdBy || e.createdBy === group.meId;

  const [swipeX, setSwipeX] = useState(0);
  // Al escanear un ticket en otra moneda, permite ver los ítems en la moneda
  // original del recibo (en vez de la ya convertida) para validar que el
  // escaneo corresponde con lo que realmente decía el ticket.
  const [showOriginal, setShowOriginal] = useState(false);
  const canShowOriginal = !!(e.originalCurrency && e.fxRate);
  // Preferimos el monto nativo tal cual lo detectó el escaneo (`original`);
  // si no existe (propina, o gastos guardados antes de este cambio), lo
  // aproximamos reconvirtiendo el monto ya convertido con el fxRate.
  const itemMoney = (converted: number, original?: number) =>
    showOriginal && canShowOriginal
      ? rawMoney(original ?? converted / e.fxRate!, e.originalCurrency)
      : money(converted);
  const drag = useRef<{ startX: number; startY: number; startSwipe: number; horiz: boolean | null; active: boolean }>({
    startX: 0,
    startY: 0,
    startSwipe: 0,
    horiz: null,
    active: false,
  });

  function onTouchStart(ev: React.TouchEvent) {
    if (!isMine) return;
    const touch = ev.touches[0];
    drag.current = { startX: touch.clientX, startY: touch.clientY, startSwipe: swipeX, horiz: null, active: true };
  }
  function onTouchMove(ev: React.TouchEvent) {
    if (!drag.current.active) return;
    const touch = ev.touches[0];
    const dx = touch.clientX - drag.current.startX;
    const dy = touch.clientY - drag.current.startY;
    if (drag.current.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      drag.current.horiz = Math.abs(dx) > Math.abs(dy);
    }
    if (!drag.current.horiz) return;
    const next = Math.min(0, Math.max(-SWIPE_W, drag.current.startSwipe + dx));
    setSwipeX(next);
  }
  function onTouchEnd() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setSwipeX((v) => (v < -SWIPE_W / 2 ? -SWIPE_W : 0));
  }

  function handleHeaderClick() {
    if (swipeX !== 0) {
      setSwipeX(0);
      return;
    }
    onToggleOpen();
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {isMine && swipeX !== 0 && (
        <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: SWIPE_W }}>
          <button
            onClick={() => {
              setSwipeX(0);
              onDelete();
            }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white"
            style={{ background: "var(--coral)" }}
          >
            <Icon name="trash" size={16} />
            <span className="text-[10px] font-semibold">{t("common.delete")}</span>
          </button>
        </div>
      )}
      <div
        className="glass hover-lift"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: drag.current.active ? "none" : "transform 0.2s ease",
          touchAction: "pan-y",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="px-3 py-2 flex items-center gap-2.5 cursor-pointer" onClick={handleHeaderClick}>
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 surface-soft text-[color:var(--ink)]">
            <Icon name={c.icon} size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate flex items-center gap-2 text-[15px] leading-tight">
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
            <div className="text-[11px] text-muted leading-tight mt-0.5 flex items-center gap-1.5">
              <span className="truncate">
                {t("exp.meta", { payer: payerDisplay, date: fmtDate(e.date) })}
              </span>
              {participants.length > 0 && (
                <span className="flex items-center gap-0.5 shrink-0">
                  {participants.slice(0, 5).map((id) => (
                    <span
                      key={id}
                      title={name(id)}
                      className="h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-semibold"
                      style={{
                        background: (labels[id]?.color ?? "#888") + "22",
                        color: labels[id]?.color ?? "#888",
                      }}
                    >
                      {labels[id]?.label ?? "?"}
                    </span>
                  ))}
                  {participants.length > 5 && (
                    <span className="text-[10px] text-muted font-semibold">+{participants.length - 5}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 flex items-center gap-1.5">
            <span className="font-mono font-bold text-sm">{itemMoney(e.amount, e.originalAmount ?? undefined)}</span>
            <Icon
              name="chevron"
              size={15}
              className="text-muted transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          </div>
        </div>

        {open && (
          <div className="px-3 pb-3 anim-pop">
            {e.originalCurrency && e.originalAmount != null && (
              <div className="text-[11px] text-muted mb-2">
                {t("scan.fxConvertedShort", {
                  code: e.originalCurrency,
                  rate: `1 ${e.originalCurrency} ≈ ${fmtRate(e.fxRate ?? 0)} ${group.currency}`,
                })}
              </div>
            )}
            <div className="glass rounded-xl p-3">
              {e.items?.length ? (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="text-[11px] uppercase tracking-wide font-mono text-muted">{t("exp.itemsBreakdown")}</div>
                    {canShowOriginal && (
                      <button
                        onClick={() => setShowOriginal((v) => !v)}
                        className="glass rounded-full px-2 py-0.5 text-[10px] font-medium hover-lift text-muted inline-flex items-center gap-1 shrink-0"
                      >
                        <Icon name="repeat" size={11} />
                        {showOriginal ? t("scan.viewConverted") : t("scan.viewOriginal", { code: e.originalCurrency ?? "" })}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {e.items.map((it, i) => {
                      const who = it.participantIds?.length ? it.participantIds : ids;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate pr-2">{it.name || "—"}</span>
                            <span className="font-mono shrink-0">{itemMoney(it.price, it.originalPrice)}</span>
                          </div>
                          <div className="flex items-center flex-wrap gap-1 mt-0.5">
                            {who.map((id) => (
                              <span
                                key={id}
                                title={name(id)}
                                className="h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-semibold"
                                style={{ background: (labels[id]?.color ?? "#888") + "22", color: labels[id]?.color ?? "#888" }}
                              >
                                {labels[id]?.label ?? "?"}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {e.fees?.map((f, i) => (
                      <div key={`fee${i}`} className="flex items-center justify-between text-sm text-muted">
                        <span className="truncate pr-2">{f.name || t("scan.feeName")}</span>
                        <span className="font-mono shrink-0">{itemMoney(f.amount, f.originalAmount)}</span>
                      </div>
                    ))}
                    {!!e.tip && (
                      <div className="flex items-center justify-between text-sm text-muted">
                        <span>{t("scan.tip")}</span>
                        <span className="font-mono shrink-0">{itemMoney(e.tip)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">
                {e.items?.length ? t("exp.perPerson") : t("exp.shares")}
              </div>
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
                    {showOriginal && canShowOriginal ? (
                      <span className="font-mono text-right">
                        {money(shares[id] || 0)}
                        <span className="block text-[10px] font-normal text-muted">
                          {rawMoney((shares[id] || 0) / e.fxRate!, e.originalCurrency)}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono">{money(shares[id] || 0)}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={onEdit}
                  className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                >
                  <Icon name="edit" size={13} /> {t("exp.edit")}
                </button>
                {e.receiptPath && <ReceiptButton path={e.receiptPath} />}
                {!e.reviewRequested ? (
                  <button
                    onClick={onRequestReview}
                    className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                  >
                    <Icon name="flag" size={13} /> {t("exp.review")}
                  </button>
                ) : e.createdBy === group.meId ? (
                  <button
                    onClick={onMarkReviewed}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift inline-flex items-center gap-1"
                    style={{ background: "#0A8B5E" }}
                  >
                    <Icon name="check" size={13} /> {t("exp.reviewed")}
                  </button>
                ) : (
                  <button
                    onClick={onCancelReview}
                    title={t("exp.tapToCancel")}
                    className="rounded-full px-3 py-1 text-xs font-semibold hover-lift inline-flex items-center gap-1"
                    style={{ background: "rgba(232,146,12,0.16)", color: "var(--amber)" }}
                  >
                    <Icon name="flag" size={13} /> {t("exp.reviewRequested")} <Icon name="close" size={12} />
                  </button>
                )}
                {e.createdBy && e.createdBy !== group.meId ? (
                  e.deleteRequested ? (
                    <button
                      onClick={onCancelDelete}
                      title={t("exp.tapToCancel")}
                      className="rounded-full px-3 py-1 text-xs font-semibold hover-lift inline-flex items-center gap-1"
                      style={{ background: "rgba(232,146,12,0.16)", color: "var(--amber)" }}
                    >
                      <Icon name="clock" size={13} /> {t("exp.deletePending")} <Icon name="close" size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={onRequestDelete}
                      className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
                    >
                      <Icon name="trash" size={13} /> {t("exp.requestDelete")}
                    </button>
                  )
                ) : e.deleteRequested ? (
                  <button
                    onClick={onDelete}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift inline-flex items-center gap-1"
                    style={{ background: "var(--coral)" }}
                  >
                    <Icon name="trash" size={13} /> {t("exp.deleteApprove")}
                  </button>
                ) : (
                  <button
                    onClick={onDelete}
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
    </div>
  );
}
