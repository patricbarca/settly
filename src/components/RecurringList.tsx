import { useState } from "react";
import type { Group, RecurrenceInterval } from "../lib/types";
import { addRecurring, updateRecurring, deleteRecurring } from "../lib/store";
import { draftToExpenseFields, ExpenseForm, type ExpenseDraft } from "./ExpenseForm";
import { uid, personColor, initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

const INTERVALS: RecurrenceInterval[] = ["daily", "weekly", "monthly", "yearly"];

function RecurringModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [interval, setInterval] = useState<RecurrenceInterval>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const draft: ExpenseDraft = {
    label: "",
    amount: "",
    payerId: group.meId,
    multiPay: false,
    payments: {},
    participantIds: group.members.map((m) => m.id),
    splitMode: "equal",
    splitValues: {},
    category: "otros",
  };

  function handleSave(d: ExpenseDraft) {
    const { payerId, payments, splits } = draftToExpenseFields(d);
    addRecurring(group.id, {
      id: uid(),
      label: d.label.trim(),
      amount: Number(d.amount) || 0,
      payerId,
      ...(payments?.length ? { payments } : {}),
      participantIds: d.participantIds,
      splits: splits ?? null,
      category: d.category,
      interval,
      nextDate: startDate,
      active: true,
    });
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-lg p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-bold mb-4">{t("recur.newTitle")}</h3>

        {/* Interval */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-muted">{t("recur.interval")}</label>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {INTERVALS.map((iv) => {
              const on = interval === iv;
              return (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${on ? "" : "glass text-muted"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {t(`recur.${iv}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Start date */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("recur.startDate")}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          />
        </div>

        <ExpenseForm
          group={group}
          initial={draft}
          onSave={handleSave}
          onCancel={onClose}
          submitLabel={t("recur.save")}
        />
      </div>
    </Overlay>
  );
}

export function RecurringList({ group }: { group: Group }) {
  const t = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const recurring = group.recurring ?? [];

  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  if (recurring.length === 0) {
    return (
      <>
        <button
          onClick={() => setShowAdd(true)}
          className="glass rounded-2xl px-4 py-3 w-full text-left text-sm text-muted hover-lift flex items-center gap-2"
        >
          <Icon name="repeat" size={16} />
          <span>{t("recur.addHint")}</span>
          <span className="ml-auto font-medium" style={{ color: "var(--teal)" }}>+ {t("recur.new")}</span>
        </button>
        {showAdd && <RecurringModal group={group} onClose={() => setShowAdd(false)} />}
      </>
    );
  }

  return (
    <>
      <section className="glass rounded-3xl overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="repeat" size={15} className="text-muted" />
            {t("recur.title")}
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--pill-bg)", color: "var(--pill-fg)" }}
            >
              {recurring.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
              className="text-xs font-medium lk"
              style={{ color: "var(--teal)" }}
            >
              + {t("recur.new")}
            </button>
            <Icon
              name="chevron"
              size={14}
              className="text-muted transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "none" }}
            />
          </div>
        </div>

        {expanded && (
          <div className="border-t divide-y" style={{ borderColor: "var(--line)" }}>
            {recurring.map((r) => {
              const payer = group.members.find((m) => m.id === r.payerId);
              return (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3" style={{ opacity: r.active ? 1 : 0.5 }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{r.label}</span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(15,163,163,0.12)", color: "var(--teal)" }}
                      >
                        {t(`recur.${r.interval}`)}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                      {payer && (
                        <span
                          className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                          style={{ background: personColor(payer.name) + "22" }}
                        >
                          {initials(payer.name)}
                        </span>
                      )}
                      <span>{name(r.payerId)}</span>
                      <span>·</span>
                      {r.active
                        ? <span>{t("recur.next", { date: r.nextDate })}</span>
                        : <span>{t("recur.paused")}</span>}
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-sm shrink-0">
                    {r.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {group.currency}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateRecurring(group.id, r.id, { active: !r.active })}
                      className="glass rounded-full h-7 w-7 flex items-center justify-center hover-lift text-muted"
                      title={r.active ? t("recur.pause") : t("recur.resume")}
                    >
                      <Icon name={r.active ? "pause" : "play"} size={12} />
                    </button>
                    <button
                      onClick={() => deleteRecurring(group.id, r.id)}
                      className="glass rounded-full h-7 w-7 flex items-center justify-center hover-lift lk-danger text-muted"
                      title={t("common.delete")}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showAdd && <RecurringModal group={group} onClose={() => setShowAdd(false)} />}
    </>
  );
}
