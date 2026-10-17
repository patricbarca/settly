import { useState } from "react";
import { useT } from "../lib/i18n";
import { money, uid, decimalInput } from "../lib/format";
import { CURRENCIES, resolveToCode } from "../lib/currencies";
import { updateGroup } from "../lib/store";
import type { Budget, Group, Income, IncomeFreq } from "../lib/types";
import type { MyItem } from "../lib/personal";
import { perMonth, isRecurringOccurrence, type FixedItem } from "../lib/projection";
import { monthKey } from "../lib/report";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";

/** Vista "Proyección" de Mis gastos. Gratis: ingresos, ahorros y lo que te
 *  queda este mes. Pro: gastos fijos (personales + tu parte de los de tus
 *  grupos), proyección a fin de mes y de ahorros a 3/6/12 meses. Todo en la
 *  moneda principal con la tasa de hoy. */
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
  const [editing, setEditing] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const budget: Budget = personal.budget ?? { incomes: [] };
  const conv = (v: number, cur: string) => {
    const r = rate(cur);
    return r == null ? 0 : v * r;
  };

  const now = new Date();
  const nowKey = now.toLocaleDateString("en-CA").slice(0, 7);
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();

  const income = budget.incomes.reduce((s, i) => s + conv(perMonth(i.amount, i.freq), i.currency), 0);
  const month = items.filter((i) => monthKey(i.date) === nowKey);
  const spent = month.reduce((s, i) => s + conv(i.amount, i.currency), 0);
  const left = income - spent;
  const savings = budget.savings ? conv(budget.savings.amount, budget.savings.currency) : 0;

  // Pro
  const fixedTotal = fixed.reduce((s, f) => s + conv(f.monthly, f.currency), 0);
  const variable = (list: MyItem[]) => list.filter((i) => !isRecurringOccurrence(i.expenseId)).reduce((s, i) => s + conv(i.amount, i.currency), 0);
  const varMonth = variable(month);
  const projVar = (varMonth / Math.max(day, 1)) * daysIn;
  const projTotal = fixedTotal + projVar;
  const projLeft = income - projTotal;
  // Gasto variable medio de los últimos 3 meses completos (los que tienen datos).
  const prev: number[] = [];
  for (let k = 1; k <= 3; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = items.filter((i) => monthKey(i.date) === key);
    if (list.length) prev.push(variable(list));
  }
  const avgVar = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : projVar;
  const net = income - fixedTotal - avgVar;
  const horizon = [0, 3, 6, 12].map((n) => ({ n, v: savings + net * n }));

  const pct = income > 0 ? Math.min(100, (spent / income) * 100) : 0;
  const good = (v: number) => (v >= 0 ? "#2ED573" : "var(--coral)");
  const freqLabel = (f: string) => t(f === "biweekly" ? "proj.biweekly" : `recur.${f}`);

  return (
    <div className="space-y-3">
      {/* Este mes (gratis) */}
      <div className="glass-strong rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.thisMonth")}</div>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--teal)" }}>
            <Icon name="edit" size={13} /> {t("proj.editIncome")}
          </button>
        </div>
        {budget.incomes.length === 0 ? (
          <button onClick={() => setEditing(true)} className="w-full text-left mt-3 glass rounded-2xl p-4">
            <div className="font-semibold">{t("proj.addIncomeTitle")}</div>
            <div className="text-xs text-muted mt-1">{t("proj.addIncomeHint")}</div>
          </button>
        ) : (
          <>
            <div className="font-display text-4xl font-bold mt-1 font-mono" style={{ color: good(left) }}>
              {money(left, mainCur)}
            </div>
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

      {!pro ? (
        /* Bloqueado: gastos fijos y proyecciones son Pro */
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="lock" size={15} /> {t("proj.proTitle")}
          </div>
          <ul className="text-sm text-muted mt-2 space-y-1">
            <li>• {t("proj.proFixed")}</li>
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
          {/* Gastos fijos */}
          <div className="glass-strong rounded-3xl p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.fixed")}</div>
              <div className="font-mono font-bold">{money(fixedTotal, mainCur)}<span className="text-xs text-muted font-normal">{t("proj.perMonth")}</span></div>
            </div>
            {fixed.length === 0 ? (
              <p className="text-sm text-muted mt-2">{t("proj.noFixed")}</p>
            ) : (
              <div className="mt-2 divide-y divide-[var(--line)]">
                {fixed.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{f.label}</span>
                      <span className="block text-xs text-muted truncate">
                        {f.personal ? t("mine.personal") : f.groupName} · {freqLabel(f.interval)}
                        {f.interval !== "monthly" && <> · {money(f.amount, f.currency)}</>}
                      </span>
                    </span>
                    <span className="font-mono font-semibold shrink-0">{money(conv(f.monthly, f.currency), mainCur)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted mt-2">{t("proj.fixedHint")}</p>
          </div>

          {/* Fin de mes */}
          {budget.incomes.length > 0 && (
            <div className="glass-strong rounded-3xl p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.endOfMonth")}</div>
              <div className="font-display text-3xl font-bold mt-1 font-mono" style={{ color: good(projLeft) }}>{money(projLeft, mainCur)}</div>
              <div className="text-xs text-muted">{t(projLeft >= 0 ? "proj.endLeft" : "proj.endShort")}</div>
              <div className="text-xs text-muted mt-2">
                {t("proj.endDetail", { fixed: money(fixedTotal, mainCur), variable: money(projVar, mainCur) })}
              </div>
            </div>
          )}

          {/* Ahorros */}
          {budget.incomes.length > 0 && (
            <div className="glass-strong rounded-3xl p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("proj.savings")}</div>
              <SavingsChart points={horizon} cur={mainCur} />
              <div className="grid grid-cols-4 gap-1 mt-2 text-center">
                {horizon.map((h) => (
                  <div key={h.n}>
                    <div className="text-[11px] text-muted">{h.n === 0 ? t("proj.today") : t("proj.inMonths", { n: String(h.n) })}</div>
                    <div className="font-mono text-xs font-semibold" style={{ color: h.v < 0 ? "var(--coral)" : undefined }}>{money(h.v, mainCur)}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2">
                {t("proj.savingsHint", { net: money(net, mainCur), avg: money(avgVar, mainCur) })}
              </p>
            </div>
          )}
        </>
      )}

      {editing && <BudgetModal group={personal} onClose={() => setEditing(false)} />}
      {paywall && <Paywall onClose={() => setPaywall(false)} reason={t("proj.proTitle")} />}
    </div>
  );
}

function SavingsChart({ points, cur }: { points: { n: number; v: number }[]; cur: string }) {
  const W = 300, H = 90, P = 8;
  const vals = points.map((p) => p.v);
  const min = Math.min(0, ...vals), max = Math.max(...vals, 1);
  const x = (n: number) => P + (n / 12) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.n)},${y(p.v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label={money(points[points.length - 1].v, cur)}>
      {min < 0 && <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" />}
      <path d={`${d} L${x(12)},${H - P} L${x(0)},${H - P} Z`} fill="var(--teal)" opacity={0.12} />
      <path d={d} fill="none" stroke="var(--teal)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.n} cx={x(p.n)} cy={y(p.v)} r={3.5} fill="var(--teal)" />
      ))}
    </svg>
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
