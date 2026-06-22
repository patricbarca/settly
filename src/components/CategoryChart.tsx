import type { Group } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { money } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

const COLORS = ["#6E8B3A", "#FF5A4D", "#5B5BF0", "#E8920C", "#E84393", "#0EA5E9"];

export function CategoryChart({ group }: { group: Group }) {
  const t = useT();
  const totals: Record<string, number> = {};
  group.expenses.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });
  const entries = CATEGORIES.filter((c) => totals[c.id]).map((c) => ({ ...c, value: totals[c.id] }));
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total <= 0) return null;

  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section className="glass rounded-3xl p-5">
      <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("chart.byCategory")}</div>
      <div className="flex items-center gap-5 flex-wrap">
        <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
          <g transform="translate(60,60) rotate(-90)">
            <circle r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
            {entries.map((e, i) => {
              const frac = e.value / total;
              const seg = (
                <circle
                  key={e.id}
                  r={R}
                  fill="none"
                  stroke={COLORS[i % COLORS.length]}
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

        <div className="flex-1 min-w-[180px] space-y-1.5">
          {entries
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((e) => {
              const i = entries.findIndex((x) => x.id === e.id);
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
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
    </section>
  );
}
