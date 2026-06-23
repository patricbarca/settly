import { useState } from "react";
import type { Group, RecurrenceInterval } from "../lib/types";
import { updateGroup, addRecurring } from "../lib/store";
import { parseExpense, type ParsedExpense } from "../lib/parse";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { parseExpenseAI } from "../lib/ai";
import { CATEGORIES } from "../lib/types";
import { useSpeech } from "../lib/speech";
import { uid, money } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { usePlan, useAIRemaining, consumeAI, FREE_AI_QUOTA } from "../lib/plan";
import { Icon } from "./Icon";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { ScanReceiptModal } from "./ScanReceiptModal";
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
  const [scan, setScan] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const lang = useLang();
  // La voz va directa a la validación: transcribe → interpreta sin pulsar nada.
  const sp = useSpeech((tx) => {
    const t = tx.trim();
    if (!t) return;
    setText(t);
    interpret(t);
  }, lang);

  function openScan() {
    // Receipt scan is the AI feature gated by the freemium quota.
    if (pro || consumeAI()) setScan(true);
    else setShowPaywall(true);
  }

  function toggleRecurring() {
    if (!pro) { setShowPaywall(true); return; }
    setExpenseType((e) => (e === "recurring" ? "one-time" : "recurring"));
  }

  async function interpret(override?: string) {
    const src = (override ?? text).trim();
    if (!src || interpreting) return;
    setInterpreting(true);
    // Con Pro o cupo disponible, usa el LLM (función parse-expense). Si no hay
    // cupo, falla o no está desplegado, cae al parser local de regex (gratis).
    let r: ParsedExpense | null = await tryAI(src);
    if (!r) r = parseExpense(src, group.members, group.meId);
    // Varios pagadores: solo si la IA devolvió ≥2 y los importes cuadran con
    // el total (si no, dejamos un único pagador para no crear un borrador roto).
    const pays = r.payments ?? [];
    const paysSum = pays.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const useMulti = pays.length >= 2 && Math.abs(paysSum - (r.amount || 0)) < 0.01;
    setDraft({
      label: r.label,
      amount: r.amount || "",
      payerId: r.payerId,
      multiPay: useMulti,
      payments: useMulti
        ? Object.fromEntries(pays.map((p) => [p.memberId, p.amount]))
        : {},
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
    setInterpreting(false);
  }

  async function tryAI(src: string): Promise<ParsedExpense | null> {
    if (!pro && aiLeft <= 0) return null;
    try {
      const ai = await parseExpenseAI(
        src,
        group.members,
        group.meId,
        group.currency,
        CATEGORIES.map((c) => c.id)
      );
      const ids = new Set(group.members.map((m) => m.id));
      const participantIds = (ai.participantIds || []).filter((id) => ids.has(id));
      const payments = (ai.payments || [])
        .filter((p) => ids.has(p.memberId) && Number(p.amount) > 0)
        .map((p) => ({ memberId: p.memberId, amount: Number(p.amount) }));
      if (!pro) consumeAI();
      return {
        label: ai.label || "",
        amount: ai.amount || 0,
        payerId: ids.has(ai.payerId) ? ai.payerId : group.meId,
        payments,
        participantIds: participantIds.length ? participantIds : group.members.map((m) => m.id),
        category: CATEGORIES.find((c) => c.id === ai.category)?.id ?? "otros",
        interval: ai.interval || undefined,
      };
    } catch {
      return null;
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
      const meName = group.members.find((m) => m.id === group.meId)?.name ?? "?";
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
            createdBy: group.meId,
          },
          ...g.expenses,
        ],
        notifications: withNotif(g, {
          type: "expense_added",
          actorId: group.meId,
          actorName: meName,
          label: d.label.trim(),
          amount: Number(d.amount) || 0,
        }),
        activity: withActivity(g, {
          type: "expense_added",
          actorId: group.meId,
          actorName: meName,
          label: d.label.trim(),
          amount: Number(d.amount) || 0,
        }),
      }));
      notifyGroup(
        group.id,
        group.name,
        t("notif.expense_added", { name: meName, label: d.label.trim(), amt: money(Number(d.amount) || 0, group.currency) })
      );
    }
    setDraft(null);
    setText("");
    setExpenseType("one-time");
  }

  return (
    <section className="glass-strong rounded-3xl p-5 anim-up">
      <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "var(--muted)" }}>{t("add.title")}</div>
      {/* Texto + "Agregar" (la magia con IA) */}
      <div className="flex gap-2 items-stretch">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && interpret()}
          placeholder={t("add.placeholder")}
          className="glass rounded-2xl px-4 py-3 text-sm flex-1"
        />
        <button
          onClick={() => interpret()}
          disabled={!text.trim() || interpreting}
          className="shrink-0 rounded-2xl px-5 text-sm font-semibold text-white hover-lift disabled:opacity-40 inline-flex items-center gap-1.5"
          style={{ background: "var(--teal)" }}
        >
          <Icon name="sparkles" size={16} /> {interpreting ? "…" : t("add.add")}
        </button>
      </div>
      {(sp.listening || sp.busy) && (
        <div className="text-xs text-muted mt-1.5 pl-1 anim-up">
          {sp.busy ? t("add.transcribing") : t("add.listening")}
        </div>
      )}
      {sp.error && !sp.listening && !sp.busy && (
        <div className="text-xs mt-1.5 pl-1 anim-up" style={{ color: "var(--coral)" }}>
          {sp.error === "mic" ? t("add.micError") : t("add.sttError")}
        </div>
      )}

      {/* Métodos: Voz · Escanear · Manual */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <button
          onClick={sp.toggle}
          disabled={!sp.supported || sp.busy}
          className={`rounded-2xl py-3 flex flex-col items-center gap-1 text-xs font-medium hover-lift disabled:opacity-40 ${sp.listening ? "" : "glass"}`}
          style={sp.listening ? { background: "#D14444", color: "#fff" } : undefined}
        >
          <Icon name="mic" size={18} />
          {t("add.voice")}
        </button>
        <button
          onClick={openScan}
          className="glass rounded-2xl py-3 flex flex-col items-center gap-1 text-xs font-medium hover-lift"
        >
          <Icon name="camera" size={18} />
          <span className="inline-flex items-center gap-1">
            {t("add.scan")}
            {!pro && <span className="text-[9px] font-mono opacity-70">{aiLeft}/{FREE_AI_QUOTA}</span>}
          </span>
        </button>
        <button
          onClick={manual}
          className="glass rounded-2xl py-3 flex flex-col items-center gap-1 text-xs font-medium hover-lift"
        >
          <Icon name="edit" size={18} />
          {t("add.manual")}
        </button>
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

      {scan && <ScanReceiptModal group={group} onClose={() => setScan(false)} />}
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </section>
  );
}
