import { useState } from "react";
import { useT, useLang } from "../lib/i18n";
import { fmtDate } from "../lib/format";
import { updateGroup } from "../lib/store";
import { CATEGORIES, type Group } from "../lib/types";
import type { MyItem } from "../lib/personal";
import { perMonth, type FixedItem } from "../lib/projection";
import { monthKey } from "../lib/report";
import { consumeAI } from "../lib/plan";
import { forecastSpendingAI } from "../lib/ai";
import { Icon } from "./Icon";
import { Paywall } from "./Paywall";

const KNOWN = new Set(CATEGORIES.map((c) => c.id as string));

/** Consejos de ahorro de la IA en la pantalla principal de Mis gastos (Pro).
 *  Independiente del "Recalcular" del gasto estimado. Se guardan en
 *  `personal.budget.tips` para verlos al volver. */
export function SavingTips({ personal, items, fixed, mainCur, rate, pro }: {
  personal: Group;
  items: MyItem[];
  fixed: FixedItem[];
  mainCur: string;
  rate: (cur: string) => number | null;
  pro: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const budget = personal.budget ?? { incomes: [] };
  const tips = budget.tips ?? [];
  const conv = (v: number, c: string) => v * (rate(c) ?? 0);
  const catName = (c: string) => (KNOWN.has(c) ? t(`cat.${c}`) : c);

  async function ask() {
    if (!pro) { setPaywall(true); return; }
    setErr(false);
    if (!consumeAI("text")) return;
    const now = new Date();
    const nowKey = now.toLocaleDateString("en-CA").slice(0, 7);
    const sum = (list: MyItem[]) => {
      const by: Record<string, number> = {};
      for (const i of list) by[i.category] = (by[i.category] || 0) + conv(i.amount, i.currency);
      return by;
    };
    const months: { month: string; byCategory: Record<string, number> }[] = [];
    for (let k = 6; k >= 1; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const list = items.filter((i) => monthKey(i.date) === key);
      if (list.length) months.push({ month: key, byCategory: sum(list) });
    }
    const income = budget.incomes.reduce((s, i) => s + conv(perMonth(i.amount, i.freq), i.currency), 0);
    const fixedM = fixed.reduce((s, f) => s + conv(f.monthly, f.currency), 0)
      + (budget.recurrents ?? []).reduce((s, r) => s + conv(perMonth(r.amount, r.freq), r.currency), 0);
    setBusy(true);
    try {
      const res = await forecastSpendingAI({
        mode: "tips",
        currency: mainCur,
        lang,
        categories: CATEGORIES.map((c) => c.id),
        labels: Object.fromEntries(CATEGORIES.map((c) => [c.id, catName(c.id)])),
        months,
        thisMonth: {
          day: now.getDate(),
          daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
          byCategory: sum(items.filter((i) => monthKey(i.date) === nowKey)),
        },
        income,
        fixed: fixedM,
        today: now.toLocaleDateString("en-CA"),
      });
      if (!res.tips.length) throw new Error("empty");
      updateGroup(personal.id, (g) => ({ ...g, budget: { ...(g.budget ?? { incomes: [] }), tips: res.tips, tipsAt: now.toLocaleDateString("en-CA") } }));
    } catch (e) {
      if ((e as Error)?.name !== "AIConsentDeclined") setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-strong rounded-3xl p-5 mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">💡 {t("proj.tipsTitle")}</div>
        {!pro && <span className="text-[9px] font-bold" style={{ color: "var(--teal)" }}>PRO</span>}
      </div>
      {tips.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2">
            {tips.map((s, k) => (
              <li key={k} className="text-sm flex gap-2"><span className="shrink-0" style={{ color: "#2ED573" }}>•</span><span>{s}</span></li>
            ))}
          </ul>
          {budget.tipsAt && <div className="text-[11px] text-muted mt-2">{t("tips.updated", { date: fmtDate(budget.tipsAt) })}</div>}
        </>
      ) : (
        <p className="text-sm text-muted mt-2">{t("tips.hint")}</p>
      )}
      {err && <p className="text-xs mt-2" style={{ color: "var(--coral)" }}>{t("tips.error")}</p>}
      <button onClick={ask} disabled={busy} className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60" style={{ background: "linear-gradient(90deg, var(--indigo), var(--teal))" }}>
        <Icon name="sparkles" size={14} /> {busy ? t("tips.thinking") : t(tips.length ? "tips.again" : "tips.ask")}
      </button>
      {paywall && <Paywall onClose={() => setPaywall(false)} reason={t("proj.tipsTitle")} />}
    </div>
  );
}
