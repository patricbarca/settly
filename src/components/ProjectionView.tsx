import { useState } from "react";
import { useT, useLang } from "../lib/i18n";
import { money, uid, decimalInput, categoryColor, fmtDate } from "../lib/format";
import { CURRENCIES, resolveToCode } from "../lib/currencies";
import { updateGroup } from "../lib/store";
import { CATEGORIES, type Budget, type Group, type Income, type IncomeFreq, type PlannedRecurrent } from "../lib/types";
import type { MyItem } from "../lib/personal";
import { perMonth, perWeek, plannedThisMonth, isRecurringOccurrence, occurrencesBetween, yearPeriods, RECURRENT_TEMPLATES, type FixedItem } from "../lib/projection";
import { monthKey, monthLabel } from "../lib/report";
import { consumeAI } from "../lib/plan";
import { forecastSpendingAI } from "../lib/ai";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";

const KNOWN = new Set(CATEGORIES.map((c) => c.id as string));
const catIcon = (c: string) => CATEGORIES.find((x) => x.id === c)?.icon ?? "other";

/** Vista "Proyección" de Mis gastos.
 *  Gratis: ingresos, ahorros, lo que te queda este mes y el gráfico de gasto.
 *  Pro: recurrentes (plantillas + tu parte de los de tus grupos), objetivo de
 *  gasto (sugerido por la IA y editable), fin de mes y ahorros a 3/6/12 meses.
 *  Todo en la moneda principal con la tasa de hoy. */
export function ProjectionView({
  personal,
  items,
  fixed,
  mainCur,
  rate,
  pro,
}: {
  personal: Group;
  items: MyItem[]; // todos mis gastos de grupos NO archivados + personales
  fixed: FixedItem[];
  mainCur: string;
  rate: (cur: string) => number | null; // tasa cur -> mainCur
  pro: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [editing, setEditing] = useState(false);
  const [editRec, setEditRec] = useState(false);
  const [editGoals, setEditGoals] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const budget: Budget = personal.budget ?? { incomes: [] };
  const planned = budget.recurrents ?? [];
  const conv = (v: number, cur: string) => {
    const r = rate(cur);
    return r == null ? 0 : v * r;
  };
  // Importe en la moneda principal; si aún no hay tasa, en su moneda original.
  const show = (v: number, cur: string) => (rate(cur) == null ? money(v, cur) : money(conv(v, cur), mainCur));
  const catName = (c: string) => (KNOWN.has(c) ? t(`cat.${c}`) : c);
  const freqLabel = (f: string) => t(f === "biweekly" ? "proj.biweekly" : `recur.${f}`);
  const perLabel = (f: string) => t(`proj.per.${f}`);

  const now = new Date();
  const nowKey = now.toLocaleDateString("en-CA").slice(0, 7);
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();

  const income = budget.incomes.reduce((s, i) => s + conv(perMonth(i.amount, i.freq), i.currency), 0);
  const month = items.filter((i) => monthKey(i.date) === nowKey);
  const spent = month.reduce((s, i) => s + conv(i.amount, i.currency), 0);
  const left = income - spent;
  const savings = budget.savings ? conv(budget.savings.amount, budget.savings.currency) : 0;

  // Recurrentes: ESTE mes cuentan los cobros reales (un semanal = 4 o 5), y
  // para la proyección a varios meses se usa la media mensual.
  const groupFixedMonth = fixed.reduce((s, f) => s + conv(f.thisMonth, f.currency), 0);
  const plannedMonth = planned.reduce((s, r) => s + conv(plannedThisMonth(r.amount, r.freq), r.currency), 0);
  const fixedMonth = groupFixedMonth + plannedMonth;
  const fixedAvg = fixed.reduce((s, f) => s + conv(f.monthly, f.currency), 0) + planned.reduce((s, r) => s + conv(perMonth(r.amount, r.freq), r.currency), 0);
  // Lo planificado (p. ej. "Súper 150/semana") ya cubre esa categoría: los
  // gastos reales de esas categorías no se suman otra vez como variables.
  const plannedCats = new Set(planned.map((r) => r.category));
  const isVar = (i: MyItem) => !isRecurringOccurrence(i.expenseId) && !plannedCats.has(i.category);
  const variable = (list: MyItem[]) => list.filter(isVar).reduce((s, i) => s + conv(i.amount, i.currency), 0);
  const varMonth = variable(month);
  const projVar = (varMonth / Math.max(day, 1)) * daysIn;
  const projLeft = income - fixedMonth - projVar;
  const prev: number[] = [];
  const history: { month: string; byCategory: Record<string, number> }[] = [];
  for (let k = 1; k <= 6; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = items.filter((i) => monthKey(i.date) === key);
    if (!list.length) continue;
    if (k <= 3) prev.push(variable(list));
    const by: Record<string, number> = {};
    for (const i of list) by[i.category] = (by[i.category] || 0) + conv(i.amount, i.currency);
    history.unshift({ month: key, byCategory: by });
  }
  const histVar = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : projVar;
  // Estimación de la IA (o ajustada a mano): si el usuario la aceptó, sustituye
  // a la media histórica como gasto variable mensual en la proyección.
  const estVar = budget.goals ? Object.entries(budget.goals).filter(([c]) => !plannedCats.has(c)).reduce((a, [, v]) => a + v, 0) : 0;
  const useEst = budget.useEstimate === true && estVar > 0;
  // El estimado sale de TODO lo gastado (incluye los cobros de los recurrentes
  // de grupos), así que la parte variable es el estimado menos esos fijos.
  const groupFixedAvg = fixed.reduce((s, f) => s + conv(f.monthly, f.currency), 0);
  const estRest = Math.max(0, estVar - groupFixedAvg);
  const avgVar = useEst ? estRest : histVar;
  const net = income - fixedAvg - avgVar;

  const monthByCat: Record<string, number> = {};
  for (const i of month) monthByCat[i.category] = (monthByCat[i.category] || 0) + conv(i.amount, i.currency);
  const goals = budget.goals ?? null;
  const goalTotal = goals ? Object.values(goals).reduce((a, b) => a + b, 0) : 0;

  const pct = income > 0 ? Math.min(100, (spent / income) * 100) : 0;
  const good = (v: number) => (v >= 0 ? "#2ED573" : "var(--coral)");
  const saveBudget = (patch: Partial<Budget>) =>
    updateGroup(personal.id, (g) => ({ ...g, budget: { ...(g.budget ?? { incomes: [] }), ...patch } }));

  // Base del estimado: los 3 meses completos anteriores. La media por
  // categoría se calcula aquí (exacta); la IA solo comenta esos números.
  const base3Keys = [1, 2, 3].map((k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const base3Items = items.filter((i) => base3Keys.includes(monthKey(i.date)));
  const base3Months = base3Keys.filter((k) => base3Items.some((i) => monthKey(i.date) === k)).length;
  const avg3: Record<string, number> = {};
  for (const i of base3Items) avg3[i.category] = (avg3[i.category] || 0) + conv(i.amount, i.currency);
  for (const c of Object.keys(avg3)) avg3[c] = Math.round(avg3[c] / Math.max(base3Months, 1));

  async function suggest() {
    setAiErr(null);
    const goalsNow = Object.fromEntries(Object.entries(avg3).filter(([, v]) => v > 0));
    if (!Object.keys(goalsNow).length) { setAiErr(t("proj.noHistory")); return; }
    // Las cifras no dependen de la IA: se guardan siempre.
    saveBudget({ goals: goalsNow, insights: null, useEstimate: null });
    if (!consumeAI("text")) return;
    setAiBusy(true);
    try {
      const res = await forecastSpendingAI({
        currency: mainCur,
        lang,
        categories: CATEGORIES.map((c) => c.id),
        labels: Object.fromEntries(CATEGORIES.map((c) => [c.id, catName(c.id)])),
        months: history.filter((h) => base3Keys.includes(h.month)),
        thisMonth: { day, daysInMonth: daysIn, byCategory: monthByCat },
        income,
        fixed: fixedMonth,
        today: now.toLocaleDateString("en-CA"),
      });
      saveBudget({ insights: res.insights });
    } catch (e) {
      if ((e as Error)?.name !== "AIConsentDeclined") setAiErr(t("proj.aiError"));
    } finally {
      setAiBusy(false);
    }
  }

  const H = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</div>
      {right}
    </div>
  );
  const linkBtn = "text-xs font-semibold inline-flex items-center gap-1 shrink-0";

  return (
    <div className="space-y-3">
      {/* Este mes (gratis) */}
      <div className="glass-strong rounded-3xl p-5">
        <H right={<button onClick={() => setEditing(true)} className={linkBtn} style={{ color: "var(--teal)" }}><Icon name="edit" size={13} /> {t("proj.editIncome")}</button>}>
          {t("proj.thisMonth")}
        </H>
        {budget.incomes.length === 0 ? (
          <button onClick={() => setEditing(true)} className="w-full text-left mt-3 glass rounded-2xl p-4">
            <div className="font-semibold">{t("proj.addIncomeTitle")}</div>
            <div className="text-xs text-muted mt-1">{t("proj.addIncomeHint")}</div>
          </button>
        ) : (
          <>
            <div className="font-display text-4xl font-bold mt-1 font-mono" style={{ color: good(left) }}>{money(left, mainCur)}</div>
            <div className="text-xs text-muted">{t(left >= 0 ? "proj.leftThisMonth" : "proj.overThisMonth")}</div>
            <div className="h-2.5 rounded-full overflow-hidden mt-3" style={{ background: "var(--seg-track)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--coral)" : "var(--teal)" }} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div>
                <div className="text-xs text-muted">{t("proj.income")}</div>
                <div className="font-mono font-semibold">{money(income, mainCur)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted">{t("proj.spentSoFar")}</div>
                <div className="font-mono font-semibold">{money(spent, mainCur)}</div>
              </div>
            </div>
          </>
        )}
        {budget.savings && (
          <div className="text-xs text-muted mt-3">
            {t("proj.savingsNow")}: <span className="font-mono font-semibold" style={{ color: "var(--ink)" }}>{money(savings, mainCur)}</span>
          </div>
        )}
      </div>

      {/* Gráfico de gasto por mes / semana (gratis) */}
      <SpendingChart items={items} conv={conv} cur={mainCur} goal={goalTotal > 0 ? goalTotal + fixedMonth : null} />

      {!pro ? (
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2 font-semibold"><Icon name="lock" size={15} /> {t("proj.proTitle")}</div>
          <ul className="text-sm text-muted mt-2 space-y-1">
            <li>• {t("proj.proFixed")}</li>
            <li>• {t("proj.proGoals")}</li>
            <li>• {t("proj.proEnd")}</li>
            <li>• {t("proj.proSavings")}</li>
          </ul>
          <button
            onClick={() => setPaywall(true)}
            className="w-full rounded-full py-3 font-semibold text-white mt-4 hover-lift inline-flex items-center justify-center gap-1.5"
            style={{ background: "linear-gradient(90deg, var(--indigo), var(--teal))" }}
          >
            <Icon name="sparkles" size={16} /> {t("pro.get")}
          </button>
        </div>
      ) : (
        <>
          {/* Presupuesto mensual: suma de lo que el usuario puso */}
          <BudgetTotal
            cur={mainCur}
            rows={[
              { label: t("proj.bPlanned"), v: planned.reduce((s2, r) => s2 + conv(perMonth(r.amount, r.freq), r.currency), 0) },
              { label: t("proj.bGroups"), v: groupFixedAvg },
              { label: t(goals && estVar > 0 ? "proj.bEstRest" : "proj.bAvg3"), v: goals && estVar > 0 ? estRest : histVar },
            ]}
            income={income}
          />
          {/* Recurrentes */}
          <div className="glass-strong rounded-3xl p-5">
            <H right={<div className="font-mono font-bold">{money(fixedMonth, mainCur)}<span className="text-xs text-muted font-normal"> {t("proj.thisMonthShort")}</span></div>}>
              {t("proj.recurrents")}
            </H>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm font-semibold">{t("proj.yours")}</div>
              <button onClick={() => setEditRec(true)} className={linkBtn} style={{ color: "var(--teal)" }}>
                <Icon name={planned.length ? "edit" : "plus"} size={13} /> {t(planned.length ? "proj.editRecurrents" : "proj.addRecurrents")}
              </button>
            </div>
            {planned.length === 0 ? (
              <button onClick={() => setEditRec(true)} className="w-full text-left mt-2 glass rounded-2xl p-3 text-xs text-muted">{t("proj.recurrentsHint")}</button>
            ) : (
              <div className="mt-1 divide-y divide-[var(--line)]">
                {planned.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: categoryColor(r.category) + "26", color: categoryColor(r.category) }}>
                      <Icon name={catIcon(r.category)} size={13} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{r.label}</span>
                      <span className="block text-xs text-muted truncate">{money(r.amount, r.currency)}{perLabel(r.freq)} · {catName(r.category)}</span>
                    </span>
                    <span className="font-mono font-semibold shrink-0">{show(plannedThisMonth(r.amount, r.freq), r.currency)}</span>
                  </div>
                ))}
              </div>
            )}
            {fixed.length > 0 && (
              <>
                <div className="text-sm font-semibold mt-4">{t("proj.fromGroups")}</div>
                <div className="mt-1 divide-y divide-[var(--line)]">
                  {fixed.map((f) => (
                    <div key={f.key} className="flex items-center gap-2 py-2 text-sm">
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{f.label}</span>
                        <span className="block text-xs text-muted truncate">
                          {f.personal ? t("mine.personal") : f.groupName} · {money(f.amount, f.currency)}{perLabel(f.interval)}
                          {f.interval !== "monthly" && f.times > 0 && <> · {f.times}× {t("proj.thisMonthShort")}</>}
                        </span>
                      </span>
                      <span className="font-mono font-semibold shrink-0">{show(f.thisMonth, f.currency)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-[11px] text-muted mt-2">{t("proj.recurrentsNote")}</p>
          </div>

          {/* Objetivo de gasto (IA + editable) */}
          <div className="glass-strong rounded-3xl p-5">
            <H right={goals && <button onClick={() => setEditGoals(true)} className={linkBtn} style={{ color: "var(--teal)" }}><Icon name="edit" size={13} /> {t("proj.editGoals")}</button>}>
              {t("proj.goals")}
            </H>
            {goals && Object.keys(goals).length > 0 ? (
              <>
                <div className="font-mono text-sm mt-2">
                  <span className="font-bold">{money(Object.keys(goals).reduce((s, c) => s + (monthByCat[c] || 0), 0), mainCur)}</span>
                  <span className="text-muted"> {t("proj.soFar")} / {money(goalTotal, mainCur)}</span>
                </div>
                <div className="space-y-2.5 mt-3">
                  {Object.entries(goals).sort((a, b) => b[1] - a[1]).map(([c, g]) => {
                    const sp = monthByCat[c] || 0;
                    const over = sp > g;
                    const open = openCat === c;
                    const list = open ? [...items.filter((i) => i.category === c && (base3Keys.includes(monthKey(i.date)) || monthKey(i.date) === nowKey))] : [];
                    return (
                      <div key={c} className="text-sm">
                        <button onClick={() => setOpenCat(open ? null : c)} className="w-full text-left">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{catName(c)} <span className="text-muted text-xs">{open ? "▴" : "▾"}</span></span>
                          <span className="font-mono text-xs shrink-0" style={{ color: over ? "var(--coral)" : undefined }}>{money(sp, mainCur)} / {money(g, mainCur)}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden mt-1" style={{ background: "var(--seg-track)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, g > 0 ? (sp / g) * 100 : 100)}%`, background: over ? "var(--coral)" : categoryColor(c) }} />
                        </div>
                        </button>
                        {open && (
                          <div className="mt-2 rounded-2xl p-2 text-xs" style={{ background: "var(--seg-track)" }}>
                            {[nowKey, ...base3Keys].map((k) => {
                              const rows = list.filter((i) => monthKey(i.date) === k);
                              const tot = rows.reduce((a, i) => a + conv(i.amount, i.currency), 0);
                              return (
                                <div key={k} className="py-1">
                                  <div className="flex justify-between font-semibold text-muted">
                                    <span className="capitalize">{monthLabel(k, lang)}{k === nowKey ? ` · ${t("proj.soFar")}` : ""}</span>
                                    <span className="font-mono">{money(tot, mainCur)}</span>
                                  </div>
                                  {rows.length === 0 ? <div className="text-muted">—</div> : rows.map((i) => (
                                    <div key={i.key} className="flex justify-between gap-2 py-0.5">
                                      <span className="truncate">{fmtDate(i.date)} · {i.label} <span className="text-muted">· {i.personal ? t("mine.personal") : i.groupName}</span></span>
                                      <span className="font-mono shrink-0">{show(i.amount, i.currency)}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                            <div className="text-muted pt-1 border-t border-[var(--line)]">{t("proj.avgOf3", { avg: money(avg3[c] || 0, mainCur) })}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted mt-2">{t("proj.goalsEmpty")}</p>
            )}
            {(budget.insights ?? []).length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {budget.insights!.map((s, k) => (
                  <li key={k} className="text-xs flex gap-1.5"><Icon name="sparkles" size={12} className="shrink-0 mt-0.5" /> <span>{s}</span></li>
                ))}
              </ul>
            )}
            {goals && Object.keys(goals).length > 0 && (budget.useEstimate == null ? (
              <div className="mt-4 rounded-2xl p-3" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)" }}>
                <div className="text-sm font-semibold">{t("proj.useAsk")}</div>
                <div className="text-xs text-muted mt-0.5">{t("proj.useAskHint", { avg: money(histVar, mainCur) })}</div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => saveBudget({ useEstimate: true })} className="flex-1 rounded-full py-2 text-sm font-semibold text-white" style={{ background: "var(--teal)" }}>{t("proj.useYes")}</button>
                  <button onClick={() => setEditGoals(true)} className="flex-1 glass rounded-full py-2 text-sm font-semibold">{t("proj.useAdjust")}</button>
                  <button onClick={() => saveBudget({ useEstimate: false })} className="flex-1 glass rounded-full py-2 text-sm font-semibold">{t("proj.useNo")}</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span style={{ color: budget.useEstimate ? "var(--teal)" : undefined }} className={budget.useEstimate ? "font-semibold" : "text-muted"}>{t(budget.useEstimate ? "proj.usingEstimate" : "proj.notUsingEstimate")}</span>
                <button onClick={() => saveBudget({ useEstimate: !budget.useEstimate })} className={linkBtn} style={{ color: "var(--teal)" }}>{t("proj.toggleUse")}</button>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <button
                onClick={suggest}
                disabled={aiBusy}
                className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white hover-lift inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, var(--indigo), var(--teal))" }}
              >
                <Icon name="sparkles" size={15} /> {aiBusy ? t("proj.aiThinking") : t(goals ? "proj.aiAgain" : "proj.aiSuggest")}
              </button>
              {!goals && (
                <button onClick={() => setEditGoals(true)} className="glass rounded-full px-4 py-2.5 text-sm font-semibold">{t("proj.setManually")}</button>
              )}
            </div>
            {aiErr && <p className="text-xs mt-2" style={{ color: "var(--coral)" }}>{aiErr}</p>}
          </div>

          {/* Fin de mes */}
          {budget.incomes.length > 0 && (
            <div className="glass-strong rounded-3xl p-5">
              <H>{t("proj.endOfMonth")}</H>
              <div className="font-display text-3xl font-bold mt-1 font-mono" style={{ color: good(projLeft) }}>{money(projLeft, mainCur)}</div>
              <div className="text-xs text-muted">{t(projLeft >= 0 ? "proj.endLeft" : "proj.endShort")}</div>
              <div className="text-xs text-muted mt-2">{t("proj.endDetail", { fixed: money(fixedMonth, mainCur), variable: money(projVar, mainCur) })}</div>
            </div>
          )}

          {/* Año completo: gasto y ahorro proyectados por mes o semana */}
          {budget.incomes.length > 0 && (
            <YearForecast
              cur={mainCur}
              savings={savings}
              projVar={projVar}
              avgVar={avgVar}
              income={(by) => budget.incomes.reduce((s, i) => s + conv((by === "month" ? perMonth : perWeek)(i.amount, i.freq), i.currency), 0)}
              fixedIn={(by, a, b) =>
                fixed.reduce((s, f) => s + conv(f.amount * occurrencesBetween(f.nextDate, f.interval, a, b), f.currency), 0) +
                planned.reduce((s, r) => s + conv(by === "month" ? plannedThisMonth(r.amount, r.freq) : perWeek(r.amount, r.freq), r.currency), 0)
              }
              hint={t("proj.savingsHint", { net: money(net, mainCur), avg: money(avgVar, mainCur) })}
            />
          )}
        </>
      )}

      {editing && <BudgetModal group={personal} onClose={() => setEditing(false)} />}
      {editRec && <RecurrentsModal group={personal} defCur={mainCur} onClose={() => setEditRec(false)} />}
      {editGoals && (
        <GoalsModal
          initial={goals ?? Object.fromEntries(Object.entries(monthByCat).map(([c, v]) => [c, Math.round(v)]))}
          cur={mainCur}
          onSave={(g) => { saveBudget({ goals: g, useEstimate: true }); setEditGoals(false); }}
          onClose={() => setEditGoals(false)}
        />
      )}
      {paywall && <Paywall onClose={() => setPaywall(false)} reason={t("proj.proTitle")} />}
    </div>
  );
}

/** Barras de gasto por mes (últimos 6) o por semana (últimas 8). */
function SpendingChart({ items, conv, cur, goal }: { items: MyItem[]; conv: (v: number, c: string) => number; cur: string; goal: number | null }) {
  const t = useT();
  const lang = useLang();
  const [by, setBy] = useState<"month" | "week">("month");
  const now = new Date();
  let bars: { label: string; v: number; cur: boolean }[] = [];
  if (by === "month") {
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = items.filter((i) => monthKey(i.date) === key).reduce((s, i) => s + conv(i.amount, i.currency), 0);
      bars.push({ label: monthLabel(key, lang).slice(0, 3), v, cur: k === 0 });
    }
  } else {
    // Semanas de lunes a domingo; la última es la actual.
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let k = 7; k >= 0; k--) {
      const a = new Date(mon); a.setDate(mon.getDate() - 7 * k);
      const b = new Date(a); b.setDate(a.getDate() + 7);
      const ai = a.toLocaleDateString("en-CA"), bi = b.toLocaleDateString("en-CA");
      const v = items.filter((i) => i.date >= ai && i.date < bi).reduce((s, i) => s + conv(i.amount, i.currency), 0);
      bars.push({ label: `${a.getDate()}/${a.getMonth() + 1}`, v, cur: k === 0 });
    }
  }
  const goalLine = by === "month" ? goal : goal != null ? goal / 4.33 : null;
  const max = Math.max(1, ...bars.map((b) => b.v), goalLine ?? 0);
  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.chart")}</div>
        <div className="seg !p-0.5 text-xs" role="tablist">
          <button role="tab" aria-selected={by === "month"} onClick={() => setBy("month")}>{t("proj.byMonth")}</button>
          <button role="tab" aria-selected={by === "week"} onClick={() => setBy("week")}>{t("proj.byWeek")}</button>
        </div>
      </div>
      <div className="relative mt-4 h-36 flex items-end gap-1.5">
        {goalLine != null && (
          <div className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(goalLine / max) * 100}%`, borderColor: "var(--amber)" }}>
            <span className="absolute right-0 -top-4 text-[10px] font-semibold" style={{ color: "var(--amber)" }}>{t("proj.goalShort")}</span>
          </div>
        )}
        {bars.map((b, k) => (
          <div key={k} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <div className="text-[9px] text-muted font-mono mb-0.5 truncate w-full text-center">{b.v > 0 ? money(b.v, cur).replace(/[.,]\d+$/, "") : ""}</div>
            <div className="w-full rounded-t-md" style={{ height: `${(b.v / max) * 100}%`, minHeight: b.v > 0 ? 3 : 0, background: b.cur ? "var(--teal)" : "color-mix(in srgb, var(--teal) 45%, transparent)" }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {bars.map((b, k) => (
          <div key={k} className="flex-1 text-center text-[10px] text-muted truncate">{b.label}</div>
        ))}
      </div>
    </div>
  );
}

/** Recurrentes planificados: plantillas (solo completar importe y frecuencia)
 *  + los que añadas tú, con categoría existente o propia. */
function RecurrentsModal({ group, defCur, onClose }: { group: Group; defCur: string; onClose: () => void }) {
  const t = useT();
  const def = defCur || resolveToCode(group.currency);
  const existing = group.budget?.recurrents ?? [];
  type Row = Omit<PlannedRecurrent, "amount"> & { amount: string; tpl?: string };
  const [rows, setRows] = useState<Row[]>(() => {
    const out: Row[] = existing.map((r) => ({ ...r, amount: String(r.amount) }));
    const have = new Set(existing.map((r) => r.label.toLowerCase()));
    for (const tp of RECURRENT_TEMPLATES) {
      const label = t(`rtpl.${tp.key}`);
      if (!have.has(label.toLowerCase())) out.push({ id: uid(), label, category: tp.category, amount: "", currency: def, freq: tp.freq, tpl: tp.key });
    }
    return out;
  });
  const [customCat, setCustomCat] = useState<Record<string, boolean>>({});
  const up = (id: string, patch: Partial<Row>) => setRows((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const sel = "glass rounded-xl px-2 py-2 text-sm min-w-0";

  function save() {
    const recurrents: PlannedRecurrent[] = rows
      .filter((r) => Number(r.amount) > 0 && r.label.trim())
      .map(({ tpl: _tpl, ...r }) => ({ ...r, label: r.label.trim(), category: r.category.trim() || "otros", amount: Number(r.amount) }));
    updateGroup(group.id, (g) => ({ ...g, budget: { ...(g.budget ?? { incomes: [] }), recurrents } }));
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-xl font-bold">{t("proj.recurrents")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted"><Icon name="close" size={16} /></button>
        </div>
        <p className="text-xs text-muted mb-3">{t("proj.recurrentsModalHint")}</p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-3 space-y-2" style={{ opacity: Number(r.amount) > 0 ? 1 : 0.75 }}>
              <div className="flex gap-2 items-center">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: categoryColor(r.category) + "26", color: categoryColor(r.category) }}>
                  <Icon name={catIcon(r.category)} size={13} />
                </span>
                <input value={r.label} onChange={(e) => up(r.id, { label: e.target.value })} className="glass rounded-xl px-3 py-1.5 text-sm flex-1 min-w-0 font-semibold" />
                <button onClick={() => setRows((l) => l.filter((x) => x.id !== r.id))} className="text-muted px-1" aria-label={t("mine.delete")}><Icon name="trash" size={14} /></button>
              </div>
              <div className="flex gap-2">
                <input inputMode="decimal" value={r.amount} onChange={(e) => up(r.id, { amount: decimalInput(e.target.value) })} placeholder="0" className="glass rounded-xl px-3 py-2 text-sm w-20 min-w-0 text-right font-mono" />
                <select value={r.currency} onChange={(e) => up(r.id, { currency: e.target.value })} className={`${sel} w-[4.5rem]`}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
                <select value={r.freq} onChange={(e) => up(r.id, { freq: e.target.value as IncomeFreq })} className={`${sel} flex-1`}>
                  <option value="weekly">{t("recur.weekly")}</option>
                  <option value="biweekly">{t("proj.biweekly")}</option>
                  <option value="monthly">{t("recur.monthly")}</option>
                  <option value="yearly">{t("recur.yearly")}</option>
                </select>
              </div>
              {customCat[r.id] || !KNOWN.has(r.category) ? (
                <input
                  value={KNOWN.has(r.category) ? "" : r.category}
                  onChange={(e) => up(r.id, { category: e.target.value })}
                  placeholder={t("proj.newCategory")}
                  className="glass rounded-xl px-3 py-2 text-sm w-full"
                />
              ) : (
                <select
                  value={r.category}
                  onChange={(e) => (e.target.value === "__new" ? setCustomCat((m) => ({ ...m, [r.id]: true })) : up(r.id, { category: e.target.value }))}
                  className={`${sel} w-full`}
                >
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(`cat.${c.id}`)}</option>)}
                  <option value="__new">+ {t("proj.newCategory")}</option>
                </select>
              )}
            </div>
          ))}
          <button
            onClick={() => setRows((l) => [...l, { id: uid(), label: "", category: "otros", amount: "", currency: def, freq: "monthly" }])}
            className="glass rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1"
            style={{ color: "var(--teal)" }}
          >
            <Icon name="plus" size={14} /> {t("proj.addOther")}
          </button>
        </div>
        <button onClick={save} className="w-full rounded-full py-3 font-semibold text-white mt-5 hover-lift" style={{ background: "var(--ink)" }}>{t("common.save")}</button>
      </div>
    </Overlay>
  );
}

/** Editar el objetivo de gasto por categoría a mano. */
function GoalsModal({ initial, cur, onSave, onClose }: { initial: Record<string, number>; cur: string; onSave: (g: Record<string, number>) => void; onClose: () => void }) {
  const t = useT();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const c of CATEGORIES) o[c.id] = initial[c.id] != null ? String(initial[c.id]) : "";
    return o;
  });
  function save() {
    const g: Record<string, number> = {};
    for (const [c, v] of Object.entries(vals)) if (Number(v) > 0) g[c] = Number(v);
    onSave(g);
  }
  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-xl font-bold">{t("proj.goals")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted"><Icon name="close" size={16} /></button>
        </div>
        <p className="text-xs text-muted mb-3">{t("proj.goalsModalHint", { cur })}</p>
        <div className="space-y-2">
          {CATEGORIES.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: categoryColor(c.id) + "26", color: categoryColor(c.id) }}>
                <Icon name={c.icon} size={13} />
              </span>
              <span className="flex-1 text-sm">{t(`cat.${c.id}`)}</span>
              <input
                inputMode="decimal"
                value={vals[c.id]}
                onChange={(e) => setVals((v) => ({ ...v, [c.id]: decimalInput(e.target.value) }))}
                placeholder="—"
                className="glass rounded-xl px-3 py-2 text-sm w-24 text-right font-mono"
              />
            </div>
          ))}
        </div>
        <button onClick={save} className="w-full rounded-full py-3 font-semibold text-white mt-5 hover-lift" style={{ background: "var(--ink)" }}>{t("common.save")}</button>
      </div>
    </Overlay>
  );
}

/** Proyección a un año: por cada mes (12) o semana (52) el gasto previsto
 *  (fijos con sus cobros reales + variable medio), el ahorro y los ahorros
 *  acumulados. Barras = gasto; línea = ahorros acumulados. */
function BudgetTotal({ cur, rows, income }: { cur: string; rows: { label: string; v: number }[]; income: number }) {
  const t = useT();
  const total = rows.reduce((s, r) => s + r.v, 0);
  const left = income - total;
  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.bTitle")}</div>
      <div className="font-mono text-3xl font-bold mt-1">{money(total, cur)}<span className="text-sm text-muted font-normal">{t("proj.per.monthly")}</span></div>
      <div className="mt-3 space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2"><span className="text-muted">{r.label}</span><span className="font-mono">{money(r.v, cur)}</span></div>
        ))}
        {income > 0 && (
          <>
            <div className="flex justify-between gap-2 pt-1.5 border-t border-[var(--line)]"><span className="text-muted">{t("proj.income")}</span><span className="font-mono">{money(income, cur)}</span></div>
            <div className="flex justify-between gap-2 font-semibold"><span>{t(left >= 0 ? "proj.bLeft" : "proj.bShort")}</span><span className="font-mono" style={{ color: left >= 0 ? "#2ED573" : "var(--coral)" }}>{money(Math.abs(left), cur)}</span></div>
          </>
        )}
      </div>
      <p className="text-[11px] text-muted mt-2">{t("proj.bHint")}</p>
    </div>
  );
}

function YearForecast({
  cur, savings, projVar, avgVar, income, fixedIn, hint,
}: {
  cur: string;
  savings: number;
  projVar: number;
  avgVar: number;
  income: (by: "month" | "week") => number;
  fixedIn: (by: "month" | "week", start: number, end: number) => number;
  hint: string;
}) {
  const t = useT();
  const lang = useLang();
  const [by, setBy] = useState<"month" | "week">("month");
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const inc = income(by);
  const varPer = by === "month" ? avgVar : (avgVar * 12) / 52;
  let cum = savings;
  const rows = yearPeriods(by, lang).map((p) => {
    const fixed = fixedIn(by, p.start, p.end);
    const variable = by === "month" && p.current ? projVar : varPer;
    const spend = fixed + variable;
    const save = inc - spend;
    cum += save;
    return { ...p, spend, save, cum };
  });
  const totSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totSave = rows.reduce((s, r) => s + r.save, 0);
  const end = rows[rows.length - 1].cum;
  const max = Math.max(1, ...rows.map((r) => r.spend));
  const cMin = Math.min(0, savings, ...rows.map((r) => r.cum));
  const cMax = Math.max(1, savings, ...rows.map((r) => r.cum));
  const W = 300, Hh = 120;
  const x = (k: number) => ((k + 0.5) / rows.length) * W;
  const y = (v: number) => Hh - 6 - ((v - cMin) / (cMax - cMin || 1)) * (Hh - 12);
  const line = rows.map((r, k) => `${k ? "L" : "M"}${x(k)},${y(r.cum)}`).join(" ");
  const short = (v: number) => money(v, cur).replace(/[.,]\d+$/, "");
  const red = (v: number) => (v < 0 ? { color: "var(--coral)" } : undefined);
  const every = by === "month" ? 1 : 8;
  const per = t(by === "month" ? "proj.per.monthly" : "proj.per.weekly");
  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.year")}</div>
          <button onClick={() => setInfo(!info)} aria-label={t("common.info")} className="w-5 h-5 rounded-full glass inline-flex items-center justify-center text-[11px] font-bold" style={{ color: info ? "var(--teal)" : undefined }}>i</button>
        </div>
        <div className="seg !p-0.5 text-xs" role="tablist">
          <button role="tab" aria-selected={by === "month"} onClick={() => setBy("month")}>{t("proj.byMonth")}</button>
          <button role="tab" aria-selected={by === "week"} onClick={() => setBy("week")}>{t("proj.byWeek")}</button>
        </div>
      </div>
      {info && (
        <div className="glass rounded-2xl p-3 mt-3 text-xs space-y-1.5">
          {(["Spend", "Save", "End", "Bars", "Line", "Calc"] as const).map((k) => (
            <p key={k}><b>{t(`proj.yi.${k}.t`)}</b> {t(`proj.yi.${k}`)}</p>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="glass rounded-2xl p-2.5 min-w-0">
          <div className="text-[11px] text-muted">{t("proj.yearSpend")}</div>
          <div className="font-mono text-sm font-bold truncate">{short(totSpend)}</div>
          <div className="text-[10px] text-muted font-mono truncate">{short(totSpend / rows.length)}{per}</div>
        </div>
        <div className="glass rounded-2xl p-2.5 min-w-0">
          <div className="text-[11px] text-muted">{t("proj.yearSave")}</div>
          <div className="font-mono text-sm font-bold truncate" style={{ color: totSave >= 0 ? "#2ED573" : "var(--coral)" }}>{short(totSave)}</div>
          <div className="text-[10px] text-muted font-mono truncate">{short(totSave / rows.length)}{per}</div>
        </div>
        <div className="glass rounded-2xl p-2.5 min-w-0">
          <div className="text-[11px] text-muted">{t("proj.yearEnd")}</div>
          <div className="font-mono text-sm font-bold truncate" style={red(end)}>{short(end)}</div>
          <div className="text-[10px] text-muted font-mono truncate">{t("proj.today")}: {short(savings)}</div>
        </div>
      </div>
      <div className="relative mt-4">
        <div className="h-[120px] flex items-end" style={{ gap: by === "month" ? 6 : 1 }}>
          {rows.map((r, k) => (
            <div key={k} className="flex-1 rounded-t-sm" title={`${r.label} · ${money(r.spend, cur)}`}
              style={{ height: `${(r.spend / max) * 70}%`, minHeight: 2, background: r.current ? "var(--indigo)" : "color-mix(in srgb, var(--indigo) 40%, transparent)" }} />
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-[120px] pointer-events-none">
          {cMin < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          <path d={line} fill="none" stroke="var(--teal)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex mt-1" style={{ gap: by === "month" ? 6 : 1 }}>
        {rows.map((r, k) => (
          <div key={k} className="flex-1 text-center text-[10px] text-muted whitespace-nowrap" style={{ overflow: "visible" }}>{k % every === 0 ? r.label : ""}</div>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-muted mt-2">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--indigo)" }} /> {t("proj.legendSpend")}</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "var(--teal)" }} /> {t("proj.legendSavings")}</span>
      </div>
      <button onClick={() => setOpen(!open)} className="text-xs font-semibold mt-3" style={{ color: "var(--teal)" }}>
        {t(open ? "proj.hideDetail" : "proj.showDetail")}
      </button>
      {open && (
        <div className="mt-2 max-h-72 overflow-y-auto text-xs">
          <div className="grid grid-cols-4 gap-1 text-muted font-semibold py-1">
            <span>{t(by === "month" ? "proj.colMonth" : "proj.colWeek")}</span>
            <span className="text-right">{t("proj.legendSpend")}</span>
            <span className="text-right">{t("proj.colSave")}</span>
            <span className="text-right">{t("proj.legendSavings")}</span>
          </div>
          {rows.map((r, k) => (
            <div key={k} className="grid grid-cols-4 gap-1 py-1 border-t border-[var(--line)] font-mono" style={r.current ? { fontWeight: 700 } : undefined}>
              <span className="font-sans">{r.label}</span>
              <span className="text-right">{short(r.spend)}</span>
              <span className="text-right" style={red(r.save)}>{short(r.save)}</span>
              <span className="text-right" style={red(r.cum)}>{short(r.cum)}</span>
            </div>
          ))}
          <div className="grid grid-cols-4 gap-1 py-1.5 border-t-2 border-[var(--line)] font-mono font-bold">
            <span className="font-sans">{t("proj.total")}</span>
            <span className="text-right">{short(totSpend)}</span>
            <span className="text-right" style={red(totSave)}>{short(totSave)}</span>
            <span className="text-right" style={red(end)}>{short(end)}</span>
          </div>
          <div className="text-[11px] text-muted mt-1">{t("proj.income")}: {short(inc)}{per}</div>
        </div>
      )}
      <p className="text-[11px] text-muted mt-2">{hint}</p>
    </div>
  );
}

/** Ingresos (con frecuencia y moneda) y ahorros actuales. Se guardan en el
 *  grupo personal (solo lo ves tú). */
function BudgetModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const def = group.budget ?? { incomes: [] };
  const [incomes, setIncomes] = useState<(Omit<Income, "amount"> & { amount: string })[]>(
    def.incomes.map((i) => ({ ...i, amount: String(i.amount) }))
  );
  const [sav, setSav] = useState(def.savings ? String(def.savings.amount) : "");
  const [savCur, setSavCur] = useState(def.savings?.currency || resolveToCode(group.currency));
  const sel = "glass rounded-xl px-2 py-2 text-sm min-w-0";

  function add() {
    setIncomes((l) => [...l, { id: uid(), label: t("proj.salary"), amount: "", currency: resolveToCode(group.currency), freq: "monthly" }]);
  }
  function save() {
    const budget: Budget = {
      incomes: incomes
        .map((i) => ({ ...i, amount: Number(i.amount) || 0, label: i.label.trim() || t("proj.income") }))
        .filter((i) => i.amount > 0),
      savings: Number(sav) > 0 ? { amount: Number(sav), currency: savCur } : null,
    };
    updateGroup(group.id, (g) => ({ ...g, budget }));
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-bold">{t("proj.editIncome")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="text-xs text-muted mb-3">{t("proj.privateNote")}</p>

        <label className="text-xs font-semibold text-muted">{t("proj.incomes")}</label>
        <div className="space-y-2 mt-1">
          {incomes.map((i, idx) => {
            const up = (patch: Partial<typeof i>) => setIncomes((l) => l.map((x, k) => (k === idx ? { ...x, ...patch } : x)));
            return (
              <div key={i.id} className="glass rounded-2xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={i.label} onChange={(e) => up({ label: e.target.value })} className="glass rounded-xl px-3 py-2 text-sm flex-1 min-w-0" />
                  <button onClick={() => setIncomes((l) => l.filter((_, k) => k !== idx))} className="text-muted px-1" aria-label={t("mine.delete")}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    inputMode="decimal"
                    value={i.amount}
                    onChange={(e) => up({ amount: decimalInput(e.target.value) })}
                    placeholder="0"
                    className="glass rounded-xl px-3 py-2 text-sm w-24 min-w-0 text-right font-mono"
                  />
                  <select value={i.currency} onChange={(e) => up({ currency: e.target.value })} className={`${sel} w-20`}>
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                  <select value={i.freq} onChange={(e) => up({ freq: e.target.value as IncomeFreq })} className={`${sel} flex-1`}>
                    <option value="monthly">{t("recur.monthly")}</option>
                    <option value="biweekly">{t("proj.biweekly")}</option>
                    <option value="weekly">{t("recur.weekly")}</option>
                    <option value="yearly">{t("recur.yearly")}</option>
                  </select>
                </div>
              </div>
            );
          })}
          <button onClick={add} className="glass rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1" style={{ color: "var(--teal)" }}>
            <Icon name="plus" size={14} /> {t("proj.addIncome")}
          </button>
        </div>

        <label className="text-xs font-semibold text-muted block mt-4">{t("proj.savingsNow")}</label>
        <div className="flex gap-2 mt-1">
          <input
            inputMode="decimal"
            value={sav}
            onChange={(e) => setSav(decimalInput(e.target.value))}
            placeholder="0"
            className="glass rounded-xl px-3 py-2 text-sm flex-1 min-w-0 text-right font-mono"
          />
          <select value={savCur} onChange={(e) => setSavCur(e.target.value)} className={`${sel} w-20`}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>

        <button onClick={save} className="w-full rounded-full py-3 font-semibold text-white mt-5 hover-lift" style={{ background: "var(--ink)" }}>
          {t("common.save")}
        </button>
      </div>
    </Overlay>
  );
}
