import type { Group } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { money, categoryColor } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { useState } from "react";

type Period = "month" | "3m" | "year" | "all";
function since(p: Period): string {
  if (p === "all") return "";
  const d = new Date();
  if (p === "month") d.setDate(1);
  else if (p === "3m") { d.setDate(1); d.setMonth(d.getMonth() - 2); }
  else { d.setMonth(0, 1); }
  return d.toLocaleDateString("en-CA");
}

export function CategoryChart({ group }: { group: Group }) {
  const t = useT();
  const [period, setPeriod] = useState<Period>("all");
  const from = since(period);
  const totals: Record<string, number> = {};
  group.expenses.filter((e) => !from || (e.date || "") >= from).forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });
  const entries = CATEGORIES.filter((c) => totals[c.id]).map((c) => ({ ...c, value: totals[c.id] }));
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (!group.expenses.length) return null;

  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section className="glass rounded-3xl p-5">
      <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("chart.byCategory")}</div>
      <div className="seg !p-0.5 text-xs mb-4" role="tablist">
        {(["month", "3m", "year", "all"] as Period[]).map((p) => (
          <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}>{t(`chart.p.${p}`)}</button>
        ))}
      </div>
      {total <= 0 ? <p className="text-sm text-muted text-center py-6">{t("chart.empty")}</p> : (
      <div className="flex flex-col items-center gap-5">
        <svg width="170" height="170" viewBox="0 0 120 120" className="shrink-0">
          <g transform="translate(60,60) rotate(-90)">
            <circle r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
            {entries.map((e) => {
              const frac = e.value / total;
              const seg = (
                <circle
                  key={e.id}
                  r={R}
                  fill="none"
                  stroke={categoryColor(e.id)}
                  strokeWidth="14"
                  strokeDasharray={`${frac * C} ${C}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += frac * C;
              return seg;
            })}
          </g>
          <text x="60" y="64" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" className="font-mono">
            {money(total, group.currency)}
          </text>
        </svg>

        <div className="w-full space-y-2">
          {entries
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((e) => {
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: categoryColor(e.id) }} />
                  <span className="truncate inline-flex items-center gap-1.5">
                    <Icon name={e.icon} size={15} /> {t(`cat.${e.id}`)}
                  </span>
                  <span className="ml-auto font-mono text-muted text-xs">{Math.round((e.value / total) * 100)}%</span>
                  <span className="font-mono font-semibold w-20 text-right">{money(e.value, group.currency)}</span>
                </div>
              );
            })}
        </div>
      </div>
      )}
    </section>
  );
}
