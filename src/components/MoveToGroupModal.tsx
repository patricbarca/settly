import { useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { addExpense, deleteExpense, updateGroup, useGroups } from "../lib/store";
import { makeNotif } from "../lib/notifications";
import { makeActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { money, uid } from "../lib/format";
import { resolveToCode } from "../lib/currencies";
import { useArchivedGroups } from "../lib/archivedGroups";
import type { Expense, Group } from "../lib/types";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

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
  const [who, setWho] = useState<Set<string> | null>(null);
  const sel = who ?? new Set(target?.members.map((m) => m.id) ?? []);
  const cur = resolveToCode(expense.currency ?? personal.currency);

  function pick(id: string) {
    setGid(id);
    setWho(null);
  }
  function toggle(id: string) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setWho(n);
  }

  function move() {
    if (!target || !sel.size) return;
    const meName = target.members.find((m) => m.id === target.meId)?.name ?? "?";
    const other = cur !== resolveToCode(target.currency);
    if (other && !target.multiCurrency) updateGroup(target.id, (g) => ({ ...g, multiCurrency: true }));
    addExpense(
      target.id,
      {
        id: uid(),
        label: expense.label,
        amount: expense.amount,
        payerId: target.meId,
        participantIds: target.members.filter((m) => sel.has(m.id)).map((m) => m.id),
        splits: null,
        category: expense.category,
        date: expense.date,
        createdBy: target.meId,
        allowEdits: false,
        ...(expense.receiptPath ? { receiptPath: expense.receiptPath } : {}),
        ...(other ? { currency: cur } : {}),
      },
      {
        notifAdd: makeNotif({ type: "expense_added", actorId: target.meId, actorName: meName, label: expense.label, amount: expense.amount }),
        activity: makeActivity({ type: "expense_added", actorId: target.meId, actorName: meName, label: expense.label, amount: expense.amount }),
      },
    );
    notifyGroup(target.id, target.name, t("notif.expense_added", { name: meName, label: expense.label, amt: money(expense.amount, cur) }), "expenses");
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

        {!options.length ? (
          <p className="text-sm mt-4">{t("move.none")}</p>
        ) : (
          <>
            <label className="text-xs font-semibold text-muted block mt-4">{t("move.group")}</label>
            <select value={gid} onChange={(e) => pick(e.target.value)} className="glass rounded-xl px-3 py-2 text-sm w-full min-w-0 mt-1">
              {options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {target && (
              <>
                <label className="text-xs font-semibold text-muted block mt-4">{t("move.between")}</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {target.members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={sel.has(m.id) ? { background: "var(--teal)", color: "#fff" } : { background: "var(--line)" }}
                    >
                      {m.name}{m.id === target.meId ? ` (${t("common.you")})` : ""}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-3">{t("move.hint", { n: sel.size, each: money(sel.size ? expense.amount / sel.size : 0, cur) })}</p>
              </>
            )}
            <button disabled={!target || !sel.size} onClick={move} className="w-full rounded-2xl py-3 text-sm font-semibold text-white mt-4 disabled:opacity-40" style={{ background: "var(--teal)" }}>
              {t("move.cta", { g: target?.name ?? "" })}
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}
