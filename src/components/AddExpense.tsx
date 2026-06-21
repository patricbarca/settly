import { useRef, useState, type ChangeEvent } from "react";
import type { Group, RecurrenceInterval } from "../lib/types";
import { updateGroup, addRecurring } from "../lib/store";
import { parseExpense } from "../lib/parse";
import { parseExpenseAI, type AIExpense } from "../lib/ai";
import { useSpeech } from "../lib/speech";
import { uid } from "../lib/format";
import { useT } from "../lib/i18n";
import { usePlan, useAIRemaining, consumeAI, FREE_AI_QUOTA } from "../lib/plan";
import { Icon } from "./Icon";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { Paywall } from "./Paywall";

const INTERVALS: RecurrenceInterval[] = ["daily", "weekly", "monthly", "yearly"];
type ExpenseType = "one-time" | "recurring";

export function AddExpense({ group }: { group: Group }) {
  const t = useT();
  const plan = usePlan();
  const pro = plan === "pro";
  const aiLeft = useAIRemaining();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseType>("one-time");
  const [recurInterval, setRecurInterval] = useState<RecurrenceInterval>("monthly");
  const [recurStartDate, setRecurStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sp = useSpeech((tx) => setText((p) => (p ? `${p} ${tx}` : tx)));

  // Build the review draft from an AI/parsed expense and pre-set recurrence.
  function fillFrom(r: AIExpense) {
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
    if (r.interval && pro) {
      setExpenseType("recurring");
      setRecurInterval(r.interval);
    } else {
      setExpenseType("one-time");
    }
  }

  function toggleRecurring() {
    if (!pro) { setShowPaywall(true); return; }
    setExpenseType((e) => (e === "recurring" ? "one-time" : "recurring"));
  }

  // Texto (escrito o dictado) → IA → formulario. Si la IA falla o se acabó la
  // cuota gratis, cae al parser local (gratis) para no bloquear nunca.
  async function interpret() {
    if (!text.trim() || busy) return;
    setBusy(true);
    let r: AIExpense | null = null;
    if (pro || aiLeft > 0) {
      try {
        r = await parseExpenseAI({ text }, group.members, group.meId, group.currency);
        if (!pro) consumeAI();
      } catch {
        r = null;
      }
    }
    if (!r) r = parseExpense(text, group.members, group.meId);
    fillFrom(r);
    setBusy(false);
  }

  // Escanear ticket: la cámara/galería entrega la imagen, la IA la lee y rellena
  // el formulario (mismo flujo que la voz). Gasta una unidad de cuota.
  function openScan() {
    if (busy) return;
    if (!pro && aiLeft <= 0) { setShowPaywall(true); return; }
    fileRef.current?.click();
  }

  async function onScanFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const r = await parseExpenseAI({ file }, group.members, group.meId, group.currency);
      if (!pro) consumeAI();
      fillFrom(r);
    } catch {
      // La función no está desplegada o la lectura falló: abre el formulario
      // manual vacío para no dejar al usuario sin salida.
      manual();
    } finally {
      setBusy(false);
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
          disabled={!text.trim() || busy}
          className="glass-strong rounded-full px-4 py-2 text-sm font-medium hover-lift disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy && <Icon name="repeat" size={14} className="spin" />}
          {busy ? t("add.thinking") : t("add.interpret")}
        </button>
        <button
          onClick={openScan}
          disabled={busy}
          className="glass rounded-full px-4 py-2 text-sm hover-lift text-muted inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Icon name="camera" size={16} /> {t("add.scan")}
          {!pro && (
            <span className="text-[10px] font-mono opacity-70">
              {aiLeft}/{FREE_AI_QUOTA}
            </span>
          )}
        </button>
        <button onClick={manual} disabled={busy} className="glass rounded-full px-4 py-2 text-sm hover-lift text-muted disabled:opacity-50">
          {t("add.manual")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onScanFile}
        />
      </div>

      {draft && (
        <div className="mt-4 glass rounded-3xl p-4 anim-pop">
          <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("add.review")}</div>

          <ExpenseForm
            group={group}
            initial={draft}
            onSave={save}
            onCancel={() => { setDraft(null); setExpenseType("one-time"); }}
            submitLabel={expenseType === "recurring" ? t("recur.save") : t("add.submit")}
          >
            {/* Recurring toggle — sits between category and save button */}
            <div className="border-t pt-3 mt-1" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="repeat" size={14} className="text-muted" />
                  <span className="text-sm">{t("add.repeatToggle")}</span>
                  {!pro && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "rgba(91,91,240,0.12)", color: "var(--indigo)" }}
                    >
                      <Icon name="lock" size={10} /> {t("pro.badge")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={toggleRecurring}
                  className="relative w-11 h-6 rounded-full shrink-0 transition-colors"
                  style={{ background: pro && expenseType === "recurring" ? "var(--teal)" : "rgba(128,128,128,0.25)" }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                    style={{ left: 2, transform: pro && expenseType === "recurring" ? "translateX(20px)" : "none" }}
                  />
                </button>
              </div>

              {expenseType === "recurring" && (
                <div className="mt-3 space-y-3 anim-pop">
                  <div>
                    <label className="text-xs font-semibold text-muted">{t("recur.interval")}</label>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {INTERVALS.map((iv) => {
                        const on = recurInterval === iv;
                        return (
                          <button
                            key={iv}
                            type="button"
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
            </div>
          </ExpenseForm>
        </div>
      )}

      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </section>
  );
}
