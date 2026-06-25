import { useState } from "react";
import type { Group, RecurrenceInterval } from "../lib/types";
import { addRecurring, updateRecurring, deleteRecurring } from "../lib/store";
import { draftToExpenseFields, ExpenseForm, type ExpenseDraft } from "./ExpenseForm";
import { uid, memberLabels } from "../lib/format";
import { parseExpense } from "../lib/parse";
import { useSpeech } from "../lib/speech";
import { useT, useLang } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

const INTERVALS: RecurrenceInterval[] = ["daily", "weekly", "monthly", "yearly"];

function RecurringModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [interval, setInterval] = useState<RecurrenceInterval>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [voiceText, setVoiceText] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<ExpenseDraft>({
    label: "",
    amount: "",
    payerId: group.meId,
    multiPay: false,
    payments: {},
    participantIds: group.members.map((m) => m.id),
    splitMode: "equal",
    splitValues: {},
    category: "otros",
  });

  const sp = useSpeech((tx) => setVoiceText((p) => (p ? `${p} ${tx}` : tx)), lang);

  function interpret() {
    if (!voiceText.trim()) return;
    const r = parseExpense(voiceText, group.members, group.meId);
    setDraft((d) => ({
      ...d,
      label: r.label || d.label,
      amount: r.amount ? String(r.amount) : d.amount,
      payerId: r.payerId || d.payerId,
      participantIds: r.participantIds?.length ? r.participantIds : d.participantIds,
      category: r.category || d.category,
    }));
    if (r.interval) setInterval(r.interval);
    setFormKey((k) => k + 1);
  }

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

        {/* Voice / text input */}
        <div className="flex gap-2 items-stretch mb-4">
          <input
            value={voiceText}
            onChange={(e) => setVoiceText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && interpret()}
            placeholder={t("add.placeholder")}
            className="glass rounded-xl px-3 py-2.5 text-sm flex-1"
          />
          <button
            onClick={sp.toggle}
            disabled={!sp.supported}
            title={sp.supported ? t("add.dictate") : t("add.voiceOff")}
            className={`h-10 w-10 shrink-0 rounded-full text-white flex items-center justify-center disabled:opacity-40 ${sp.listening ? "mic-on" : ""}`}
            style={{ background: sp.listening ? "#D14444" : "var(--ink)" }}
          >
            <Icon name="mic" size={17} />
          </button>
          <button
            onClick={interpret}
            disabled={!voiceText.trim()}
            className="glass-strong rounded-xl px-3 py-2.5 text-sm font-medium hover-lift disabled:opacity-40"
          >
            {t("add.interpret")}
          </button>
        </div>

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
          key={formKey}
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
  // Iniciales + color únicos por grupo (evita que dos personas se vean iguales).
  const labels = memberLabels(group.members);

  // Recurring expenses are now created via the toggle in the add form,
  // so the empty-state hint pill is hidden — only show the list when items exist.
  if (recurring.length === 0) return null;

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
              const participants = r.participantIds.length
                ? r.participantIds
                : group.members.map((m) => m.id);
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
                          style={{ background: labels[payer.id].color + "22", color: labels[payer.id].color }}
                        >
                          {labels[payer.id].label}
                        </span>
                      )}
                      <span>{name(r.payerId)}</span>
                      <span>·</span>
                      {r.active
                        ? <span>{t("recur.next", { date: r.nextDate })}</span>
                        : <span>{t("recur.paused")}</span>}
                    </div>
                    {/* Burbujas con las iniciales de quienes participan, igual
                        que en la fila de un gasto normal (ExpenseList). */}
                    {participants.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1 mt-1.5">
                        {participants.slice(0, 7).map((pid) => (
                          <span
                            key={pid}
                            title={name(pid)}
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                            style={{
                              background: (labels[pid]?.color ?? "#888") + "22",
                              color: labels[pid]?.color ?? "#888",
                              boxShadow: "0 0 0 1.5px var(--surface)",
                            }}
                          >
                            {labels[pid]?.label ?? "?"}
                          </span>
                        ))}
                        {participants.length > 7 && (
                          <span className="text-[10px] text-muted ml-0.5">+{participants.length - 7}</span>
                        )}
                      </div>
                    )}
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
