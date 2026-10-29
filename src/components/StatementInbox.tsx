import { useEffect, useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { deleteExpense, patchExpense } from "../lib/store";
import { CATEGORIES, type Category, type Expense, type Group } from "../lib/types";
import { categoryColor, fmtDate, money } from "../lib/format";
import { resolveToCode } from "../lib/currencies";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { ConfirmModal } from "./ConfirmModal";
import { ExpenseForm, type ExpenseDraft } from "./ExpenseForm";
import { MoveToGroupModal } from "./MoveToGroupModal";
import { haptic } from "../lib/haptics";

/** Bandeja "Del estado de cuenta": lo importado del banco queda aquí (no cuenta
 *  en Mis gastos) hasta que lo pasas a tu bóveda, a un grupo, o lo descartas. */
export function StatementInbox({ personal, statementId, title }: { personal: Group; statementId?: string; title?: string }) {
  const t = useT();
  const items = useMemo(
    () =>
      personal.expenses
        .filter((e) => (statementId ? stmtKey(e) === statementId : e.inbox))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [personal.expenses, statementId],
  );
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Expense | null>(null);
  const [moving, setMoving] = useState<Expense | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmVault, setConfirmVault] = useState(false);
  const [undo, setUndo] = useState<string[] | null>(null);
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(id);
  }, [undo]);
  const undoBar = undo && (
    <div className="glass rounded-2xl mt-5 p-3 flex items-center gap-3 text-sm">
      <span className="flex-1">{t("inbox.moved", { n: undo.length })}</span>
      <button className="font-semibold" style={{ color: "var(--teal)" }} onClick={undoVault}>{t("inbox.undo")}</button>
    </div>
  );
  async function undoVault() {
    const ids = undo ?? [];
    setUndo(null);
    for (let k = 0; k < ids.length; k += 6) await Promise.all(ids.slice(k, k + 6).map((id) => patchExpense(personal.id, id, { inbox: true })));
  }
  if (!items.length) return undoBar || null;

  const live = new Set([...sel].filter((id) => items.some((e) => e.id === id)));
  const picked = items.filter((e) => live.has(e.id));
  const cur = (e: Expense) => resolveToCode(e.currency ?? personal.currency);
  const allOn = live.size === items.length;
  const toggle = (id: string) => {
    const n = new Set(live);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  const byDate = new Map<string, Expense[]>();
  for (const e of items) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  async function toVault() {
    setConfirmVault(false);
    const ids = [...live];
    setUndo(ids);
    for (let k = 0; k < ids.length; k += 6) await Promise.all(ids.slice(k, k + 6).map((id) => patchExpense(personal.id, id, { inbox: null } as Partial<Expense>)));
    haptic("success");
    setSel(new Set());
  }
  async function discard() {
    const ids = [...live];
    for (let k = 0; k < ids.length; k += 6) await Promise.all(ids.slice(k, k + 6).map((id) => deleteExpense(personal.id, id)));
    setSel(new Set());
    setConfirmDel(false);
  }
  function saveEdit(d: ExpenseDraft) {
    if (!editing) return;
    patchExpense(personal.id, editing.id, { label: d.label.trim(), amount: Number(d.amount) || 0, category: d.category, date: d.date || editing.date });
    setEditing(null);
  }

  const pickedTotal = picked.reduce((s, e) => s + e.amount, 0);
  return (
    <>
    {undoBar}
    <div className="glass rounded-3xl mt-5 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3 text-left">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl shrink-0" style={{ background: "rgba(232,146,12,0.16)", color: "var(--amber)" }}><Icon name="doc" size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold truncate">{title ?? t("inbox.title")} · {items.length}</span>
          <span className="block text-[11px] text-muted">{statementId ? t("bank.detailSub", { n: items.filter((e) => e.inbox).length }) : t("inbox.sub")}</span>
        </span>
        <Icon name="chevron" size={14} className={`text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex justify-end mb-1">
            <button className="text-xs font-semibold" style={{ color: "var(--teal)" }} onClick={() => setSel(allOn ? new Set() : new Set(items.map((e) => e.id)))}>
              {allOn ? t("pay.deselectAll") : t("pay.selectAll")}
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-3">
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date}>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{fmtDate(date)}</div>
                <div className="space-y-1.5">
                  {list.map((e) => (
                    <div key={e.id} className={`rounded-2xl p-2.5 flex items-center gap-2.5 ${live.has(e.id) ? "" : "opacity-80"}`} style={{ background: "var(--line)" }}>
                      <input type="checkbox" checked={live.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 shrink-0 accent-[var(--teal)]" />
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(e)}>
                        <span className="block text-sm font-medium truncate">{e.label}</span>
                        <span className="text-[11px]" style={{ color: categoryColor(e.category) }}>{t(`cat.${e.category}`)}</span>
                        {!e.inbox && <span className="text-[10px] font-semibold ml-1.5 rounded-full px-1.5 py-0.5" style={{ background: "rgba(15,163,163,.15)", color: "var(--teal)" }}>{t("bank.inVault")}</span>}
                      </button>
                      <span className="text-sm font-mono shrink-0">{money(e.amount, cur(e))}</span>
                      <button onClick={() => setEditing(e)} className="text-muted shrink-0 p-1" aria-label={t("inbox.edit")}><Icon name="edit" size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {live.size > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => (live.size > 1 ? setConfirmVault(true) : toVault())} className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white" style={{ background: "var(--teal)" }}>
                {t("inbox.toVault", { n: live.size })}
              </button>
              {live.size === 1 && (
                <button onClick={() => setMoving(picked[0])} className="rounded-2xl px-3 py-2.5 text-sm font-semibold" style={{ color: "var(--teal)", background: "color-mix(in srgb, var(--teal) 12%, transparent)" }}>
                  {t("move.button")}
                </button>
              )}
              <button onClick={() => setConfirmDel(true)} className="rounded-2xl px-3 py-2.5 text-sm font-semibold" style={{ color: "var(--coral)", background: "color-mix(in srgb, var(--coral) 12%, transparent)" }}>
                {t("inbox.discard")}
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Overlay onClose={() => setEditing(null)}>
          <div className="glass-strong rounded-3xl w-full max-w-md p-5 anim-pop max-h-[88dvh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <h3 className="font-display text-xl font-bold mb-3">{t("inbox.edit")}</h3>
            <ExpenseForm
              group={personal}
              initial={{
                label: editing.label,
                amount: String(editing.amount),
                payerId: personal.meId,
                multiPay: false,
                payments: {},
                participantIds: [personal.meId],
                splitMode: "equal",
                splitValues: {},
                category: editing.category as Category,
                date: editing.date,
              }}
              onSave={saveEdit}
              onCancel={() => setEditing(null)}
              amountCurrency={cur(editing)}
            />
          </div>
        </Overlay>
      )}
      {moving && <MoveToGroupModal personal={personal} expense={moving} onClose={() => { setMoving(null); setSel(new Set()); }} />}
      {confirmVault && (
        <ConfirmModal
          title={t("inbox.vaultTitle", { n: live.size })}
          message={t("inbox.vaultBody", { total: money(pickedTotal, cur(picked[0])) })}
          confirmLabel={t("inbox.toVault", { n: live.size })}
          danger={false}
          onConfirm={toVault}
          onClose={() => setConfirmVault(false)}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          title={t("inbox.discardTitle", { n: live.size })}
          message={t("inbox.discardBody")}
          confirmLabel={t("inbox.discard")}
          onConfirm={discard}
          onClose={() => setConfirmDel(false)}
        />
      )}
      <span className="hidden">{CATEGORIES.length}</span>
    </div>
    </>
  );
}

/** Clave de la importación de un gasto (las viejas sin statementId van juntas). */
export function stmtKey(e: Expense): string | null {
  if (e.statementId) return e.statementId;
  if (e.source === "statement" || e.id.startsWith("stm_")) return "legacy";
  return null;
}
