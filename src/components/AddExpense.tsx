import { useState } from "react";
import type { Group, RecurrenceInterval } from "../lib/types";
import { addExpense, addRecurring } from "../lib/store";
import { parseExpense, type ParsedExpense } from "../lib/parse";
import { makeNotif } from "../lib/notifications";
import { makeActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { parseExpenseAI } from "../lib/ai";
import { convertCurrency, fmtRate } from "../lib/fx";
import { CURRENCIES, resolveToCode, localCurrencyName } from "../lib/currencies";
import { CATEGORIES } from "../lib/types";
import { useSpeech } from "../lib/speech";
import { uid, money } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { usePlan, useAIRemaining, aiRemaining, consumeAI, FREE_AI_QUOTA, type AIKind } from "../lib/plan";
import { Icon } from "./Icon";
import { ExpenseForm, draftToExpenseFields, type ExpenseDraft } from "./ExpenseForm";
import { ScanReceiptModal } from "./ScanReceiptModal";
import { Paywall } from "./Paywall";

type FxInfo = { originalAmount: number; originalCurrency: string; fxRate: number };

const INTERVALS: RecurrenceInterval[] = ["daily", "weekly", "monthly", "yearly"];
type ExpenseType = "one-time" | "recurring";

export function AddExpense({ group }: { group: Group }) {
  const t = useT();
  const plan = usePlan();
  const pro = plan === "pro";
  const scanLeft = useAIRemaining("scan");
  const voiceLeft = useAIRemaining("voice");
  const textLeft = useAIRemaining("text");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseType>("one-time");
  const [recurInterval, setRecurInterval] = useState<RecurrenceInterval>("monthly");
  const [recurStartDate, setRecurStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [scan, setScan] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [fx, setFx] = useState<FxInfo | null>(null);
  const [fxUpsell, setFxUpsell] = useState<string | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);
  // Selector de moneda del gasto manual (no aplica a texto/voz, que la
  // detectan solos). Por defecto la del grupo; si eliges otra, se convierte
  // al guardar (Pro).
  const [manualMode, setManualMode] = useState(false);
  const [manualCurrency, setManualCurrency] = useState(() => resolveToCode(group.currency));
  const [manualRate, setManualRate] = useState<number | null>(null);
  const lang = useLang();
  // La voz va directa a la validación: transcribe → interpreta sin pulsar nada.
  const sp = useSpeech((tx) => {
    const t = tx.trim();
    if (!t) return;
    setText(t);
    interpret(t, "voice");
  }, lang);

  function openScan() {
    // Escaneo de recibo: cuota propia de IA (3/mes en free).
    if (pro || consumeAI("scan")) setScan(true);
    else setShowPaywall(true);
  }

  function toggleRecurring() {
    if (!pro) { setShowPaywall(true); return; }
    setExpenseType((e) => (e === "recurring" ? "one-time" : "recurring"));
  }

  // Cambiar la moneda del gasto manual: si es distinta a la del grupo, Pro
  // obtiene la tasa del día (se aplica al guardar); free ve el Paywall y la
  // selección vuelve a la moneda del grupo.
  async function pickManualCurrency(code: string) {
    const groupCode = resolveToCode(group.currency);
    if (code === groupCode) {
      setManualCurrency(groupCode);
      setManualRate(null);
      setFxError(null);
      return;
    }
    if (!pro) {
      setShowPaywall(true);
      return;
    }
    setManualCurrency(code);
    setManualRate(null);
    setFxError(null);
    const fxRes = await convertCurrency(1, code, groupCode);
    if (fxRes) setManualRate(fxRes.rate);
    else setFxError(code);
  }

  async function interpret(override?: string, kind: AIKind = "text") {
    const src = (override ?? text).trim();
    if (!src || interpreting) return;
    setInterpreting(true);
    setManualMode(false);
    setFx(null);
    setFxUpsell(null);
    setFxError(null);
    // Con Pro o cupo disponible, usa el LLM (función parse-expense). Si no hay
    // cupo, falla o no está desplegado, cae al parser local de regex (gratis).
    let r: ParsedExpense | null = await tryAI(src, kind);
    if (!r) r = parseExpense(src, group.members, group.meId);

    // Moneda distinta a la del grupo (solo la vía IA la detecta): convertir
    // (Pro) o avisar (free), igual que en el escaneo de recibos.
    if (r.currency && r.currency !== group.currency) {
      if (pro) {
        const fxRes = await convertCurrency(1, r.currency, group.currency);
        if (fxRes) {
          const rate = fxRes.rate;
          setFx({ originalAmount: r.amount, originalCurrency: r.currency, fxRate: rate });
          r = {
            ...r,
            amount: Math.round(r.amount * rate * 100) / 100,
            payments: (r.payments ?? []).map((p) => ({ ...p, amount: Math.round(p.amount * rate * 100) / 100 })),
          };
        } else {
          setFxError(r.currency);
        }
      } else {
        setFxUpsell(r.currency);
      }
    }

    // Varios pagadores: solo si la IA devolvió ≥2 y los importes cuadran con
    // el total (si no, dejamos un único pagador para no crear un borrador roto).
    const pays = r.payments ?? [];
    const paysSum = pays.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const useMulti = pays.length >= 2 && Math.abs(paysSum - (r.amount || 0)) < 0.01;
    // #3 Suposiciones (deterministas, a partir del resultado) — se muestran
    // sobre el borrador para dar contexto sin fricción.
    const n = r.participantIds.length || group.members.length;
    const payerName = group.members.find((m) => m.id === r.payerId)?.name ?? "?";
    const payerPart =
      pays.length >= 2
        ? t("ai.multiPay")
        : r.payerId === group.meId
        ? t("ai.youPay")
        : t("ai.paysName", { name: payerName });
    const sumParts = [payerPart, t("ai.among", { n: String(n) })];
    const perPerson =
      /\bcada\s+un[oa]\b|\bc\/u\b|\bpor\s+cabeza\b|\bpor\s+persona\b|\bapiece\b|\bper\s+person\b|\bper\s+head\b|\beach\b(?!\s+(day|week|month|year|d[ií]a|semana|mes|a[ñn]o))/i.test(
        src
      );
    if (perPerson && n > 0 && r.amount) sumParts.push(t("ai.each", { amt: money(r.amount / n, group.currency) }));
    setAiSummary(sumParts.join(" · "));
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

  async function tryAI(src: string, kind: AIKind): Promise<ParsedExpense | null> {
    if (!pro && aiRemaining(kind) <= 0) return null;
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
      if (!pro) consumeAI(kind);
      return {
        label: ai.label || "",
        amount: ai.amount || 0,
        currency: ai.currency,
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
    setAiSummary(null);
    setFx(null);
    setFxUpsell(null);
    setFxError(null);
    setManualMode(true);
    setManualCurrency(resolveToCode(group.currency));
    setManualRate(null);
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
    const { payerId, payments: rawPayments, splits: rawSplits } = draftToExpenseFields(d);

    // Moneda distinta elegida a mano (Pro): convierte monto, pagos y splits
    // con la misma tasa, y guarda el original para el badge (igual que IA).
    const groupCode = resolveToCode(group.currency);
    const manualForeign = manualMode && manualCurrency !== groupCode && manualRate != null;
    const rate = manualForeign ? manualRate! : 1;
    const conv = (n: number) => Math.round(n * rate * 100) / 100;
    const rawAmount = Number(d.amount) || 0;
    const amount = manualForeign ? conv(rawAmount) : rawAmount;
    const payments = manualForeign ? rawPayments?.map((p) => ({ ...p, amount: conv(p.amount) })) : rawPayments;
    const splits = manualForeign && rawSplits ? Object.fromEntries(Object.entries(rawSplits).map(([k, v]) => [k, conv(v)])) : rawSplits;
    const effectiveFx = manualForeign
      ? { originalAmount: rawAmount, originalCurrency: manualCurrency, fxRate: manualRate! }
      : fx;

    if (expenseType === "recurring") {
      addRecurring(group.id, {
        id: uid(),
        label: d.label.trim(),
        amount,
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
      addExpense(
        group.id,
        {
          id: uid(),
          label: d.label.trim(),
          amount,
          payerId,
          payments,
          participantIds: d.participantIds,
          splits,
          category: d.category,
          date: new Date().toISOString().slice(0, 10),
          createdBy: group.meId,
          ...(effectiveFx ? { originalAmount: effectiveFx.originalAmount, originalCurrency: effectiveFx.originalCurrency, fxRate: effectiveFx.fxRate } : {}),
        },
        {
          notifAdd: makeNotif({
            type: "expense_added",
            actorId: group.meId,
            actorName: meName,
            label: d.label.trim(),
            amount,
          }),
          activity: makeActivity({
            type: "expense_added",
            actorId: group.meId,
            actorName: meName,
            label: d.label.trim(),
            amount,
          }),
        }
      );
      notifyGroup(
        group.id,
        group.name,
        t("notif.expense_added", { name: meName, label: d.label.trim(), amt: money(amount, group.currency) })
      );
    }
    setDraft(null);
    setText("");
    setExpenseType("one-time");
    setAiSummary(null);
    setFx(null);
    setFxUpsell(null);
    setFxError(null);
    setManualMode(false);
  }

  return (
    <section className="glass-strong rounded-3xl p-5 anim-up">
      <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "var(--muted)" }}>{t("add.title")}</div>
      {/* Mientras hay un borrador en revisión, ocultamos el input y los métodos
          para que el flujo sea: agregar -> revisar/confirmar (sin poder meter
          otro gasto encima). Vuelven a aparecer al guardar o cancelar. */}
      {!draft && (
        <>
          {/* Texto + "Agregar" (la magia con IA) */}
          <div className="flex gap-2 items-stretch">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && interpret()}
              placeholder={t("add.placeholder")}
              className="glass rounded-2xl px-4 py-3 text-sm flex-1 min-w-0"
            />
            <button
              onClick={() => interpret()}
              disabled={!text.trim() || interpreting}
              className="shrink-0 rounded-2xl px-5 text-sm font-semibold text-white hover-lift disabled:opacity-40 inline-flex items-center gap-1.5"
              style={{ background: "var(--teal)" }}
            >
              <Icon name="sparkles" size={16} /> {interpreting ? "…" : t("add.add")}
              {!pro && !interpreting && <span className="text-[9px] font-mono opacity-80">{textLeft}/{FREE_AI_QUOTA}</span>}
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
              <span className="inline-flex items-center gap-1">
                {t("add.voice")}
                {!pro && !sp.listening && <span className="text-[9px] font-mono opacity-70">{voiceLeft}/{FREE_AI_QUOTA}</span>}
              </span>
            </button>
            <button
              onClick={openScan}
              className="glass rounded-2xl py-3 flex flex-col items-center gap-1 text-xs font-medium hover-lift"
            >
              <Icon name="camera" size={18} />
              <span className="inline-flex items-center gap-1">
                {t("add.scan")}
                {!pro && <span className="text-[9px] font-mono opacity-70">{scanLeft}/{FREE_AI_QUOTA}</span>}
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
        </>
      )}

      {draft && (
        <div className="mt-4 glass rounded-3xl p-4 anim-pop">
          <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{aiSummary ? t("add.review") : t("add.manualReview")}</div>

          {manualMode && (
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted">{t("add.manualCurrency")}</label>
              <select
                value={manualCurrency}
                onChange={(e) => pickManualCurrency(e.target.value)}
                className="glass rounded-xl px-3 py-2 text-sm w-full mt-1"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {localCurrencyName(c.code, lang === "es" ? "es-ES" : "en-US")}
                  </option>
                ))}
              </select>
              {manualCurrency !== resolveToCode(group.currency) && manualRate != null && (
                <p className="text-[11px] mt-1" style={{ color: "var(--teal)" }}>
                  {t("add.manualCurrencyHint", {
                    rate: `1 ${manualCurrency} ≈ ${fmtRate(manualRate)} ${group.currency}`,
                  })}
                </p>
              )}
            </div>
          )}

          {aiSummary && (
            <div className="mb-3 -mt-1 flex items-start gap-1.5 text-[11px] text-muted">
              <Icon name="sparkles" size={12} className="mt-0.5 shrink-0" style={{ color: "var(--teal)" }} />
              <span><b className="font-semibold">{t("ai.assumed")}:</b> {aiSummary}</span>
            </div>
          )}

          {fx && (
            <div className="glass rounded-xl px-3 py-2 mb-3 text-xs" style={{ color: "var(--teal)" }}>
              {t("scan.fxConverted", {
                amt: money(fx.originalAmount, fx.originalCurrency),
                rate: `1 ${fx.originalCurrency} ≈ ${fmtRate(fx.fxRate)} ${group.currency}`,
              })}
            </div>
          )}
          {fxError && (
            <div className="rounded-xl px-3 py-2 mb-3 text-xs" style={{ background: "rgba(255,90,77,0.12)", color: "var(--coral)" }}>
              {t("scan.fxFailed", { code: fxError })}
            </div>
          )}
          {fxUpsell && (
            <div className="glass rounded-xl px-3 py-2 mb-3 flex items-center justify-between gap-2 text-xs">
              <span>{t("scan.fxUpsell", { code: fxUpsell, target: group.currency })}</span>
              <button
                onClick={() => setShowPaywall(true)}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift"
                style={{ background: "var(--indigo)" }}
              >
                {t("scan.fxUpsellCta")}
              </button>
            </div>
          )}

          <ExpenseForm
            group={group}
            initial={draft}
            onSave={save}
            onCancel={() => { setDraft(null); setExpenseType("one-time"); setAiSummary(null); setManualMode(false); setFx(null); setFxUpsell(null); setFxError(null); }}
            submitLabel={expenseType === "recurring" ? t("recur.save") : t("add.submit")}
            amountCurrency={manualMode ? manualCurrency : undefined}
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
