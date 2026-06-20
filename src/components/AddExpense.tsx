import { useState } from "react";
import type { Group, RecurrenceInterval } from "../lib/types";
import { updateGroup, addRecurring } from "../lib/store";
import { parseExpense } from "../lib/parse";
import { useSpeech } from "../lib/speech";
import { uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { ScanReceiptModal } from "./ScanReceiptModal";

const INTERVALS: RecurrenceInterval[] = ["daily", "weekly", "monthly", "yearly"];
type ExpenseType = "one-time" | "recurring";

export function AddExpense({ group }: { group: Group }) {
  const t = useT();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseType>("one-time");
  const [recurInterval, setRecurInterval] = useState<RecurrenceInterval>("monthly");
  const [recurStartDate, setRecurStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [scan, setScan] = useState(false);
  const sp = useSpeech((tx) => setText((p) => (p ? `${p} ${tx}` : tx)));

  function interpret() {
    if (!text.trim()) return;
    const r = parseExpense(text, group.members, group.meId);
    setDraft({
      label: r.label,
      amount: r.amount || "",
      payerId: r.payerId,
      multiPay: false,
      payments: {},
      participantIds: r.participantIds,
      splitMode: "equal",
      splitValues: {},
      category: r.category,
    });
    if (r.interval) {
      setExpenseType("recurring");
      setRecurInterval(r.interval);
    } else {
      setExpenseType("one-time");
    }
  }

  function manual() {
    setDraft({
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
    setExpenseType("one-time");
  }

  function save(d: ExpenseDraft) {
    const { payerId, payments, splits } = draftToExpenseFields(d);
    if (expenseType === "recurring") {
      addRecurring(group.id, {
        id: uid(),
        label: d.label.trim(),
        amount: Number(d.amount) || 0,
        payerId,
        ...(payments?.length ? { payments } : {}),
        participantIds: d.participantIds,
        splits: splits ?? null,
        category: d.category,
        interval: recurInterval,
        nextDate: recurStartDate,
        active: true,
      });
    } else {
      updateGroup(group.id, (g) => ({
        ...g,
        expenses: [
          {
            id: uid(),
            label: d.label.trim(),
            amount: Number(d.amount) || 0,
            payerId,
            payments,
            participantIds: d.participantIds,
            splits,
            category: d.category,
            date: new Date().toISOString().slice(0, 10),
          },
          ...g.expenses,
        ],
      }));
    }
    setDraft(null);
    setText("");
    setExpenseType("one-time");
  }

  return (
    <section className="glass-strong rounded-3xl p-5 anim-up">
      <div className="text-xs uppercase tracking-widest font-mono text-muted mb-2">{t("add.title")}</div>
      <div className="flex gap-2 items-stretch">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && interpret()}
          placeholder={t("add.placeholder")}
          className="glass rounded-2xl px-4 py-3 text-sm flex-1"
        />
        <button
          onClick={sp.toggle}
          disabled={!sp.supported}
          title={sp.supported ? t("add.dictate") : t("add.voiceOff")}
          className={`h-12 w-12 shrink-0 rounded-full text-white flex items-center justify-center disabled:opacity-40 ${sp.listening ? "mic-on" : ""}`}
          style={{ background: sp.listening ? "#D14444" : "var(--ink)" }}
        >
          <Icon name="mic" size={20} />
        </button>
      </div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button
          onClick={interpret}
          disabled={!text.trim()}
          className="glass-strong rounded-full px-4 py-2 text-sm font-medium hover-lift disabled:opacity-50"
        >
          {t("add.interpret")}
        </button>
        <button
          onClick={() => setScan(true)}
          className="glass rounded-full px-4 py-2 text-sm hover-lift text-muted inline-flex items-center gap-1.5"
        >
          <Icon name="camera" size={16} /> {t("add.scan")}
        </button>
        <button onClick={manual} className="glass rounded-full px-4 py-2 text-sm hover-lift text-muted">
          {t("add.manual")}
        </button>
      </div>

      {draft && (
        <div className="mt-4 glass rounded-2xl p-4 anim-pop">
          <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("add.review")}</div>

          {/* One-time / Recurring toggle */}
          <div className="flex gap-1.5 mb-4">
            {(["one-time", "recurring"] as ExpenseType[]).map((type) => {
              const on = expenseType === type;
              return (
                <button
                  key={type}
                  onClick={() => setExpenseType(type)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${on ? "" : "glass text-muted"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {t(type === "one-time" ? "add.oneTime" : "add.recurringType")}
                </button>
              );
            })}
          </div>

          {/* Interval + start date (recurring only) */}
          {expenseType === "recurring" && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted">{t("recur.interval")}</label>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {INTERVALS.map((iv) => {
                    const on = recurInterval === iv;
                    return (
                      <button
                        key={iv}
                        onClick={() => setRecurInterval(iv)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium ${on ? "" : "glass text-muted"}`}
                        style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                      >
                        {t(`recur.${iv}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">{t("recur.startDate")}</label>
                <input
                  type="date"
                  value={recurStartDate}
                  onChange={(e) => setRecurStartDate(e.target.value)}
                  className="glass rounded-xl px-3 py-2 text-sm w-full mt-1"
                />
              </div>
            </div>
          )}

          <ExpenseForm
            group={group}
            initial={draft}
            onSave={save}
            onCancel={() => { setDraft(null); setExpenseType("one-time"); }}
            submitLabel={expenseType === "recurring" ? t("recur.save") : t("add.submit")}
          />
        </div>
      )}

      {scan && <ScanReceiptModal group={group} onClose={() => setScan(false)} />}
    </section>
  );
}
