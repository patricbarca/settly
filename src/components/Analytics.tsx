import type { Group } from "../lib/types";
import { catOf } from "../lib/types";
import { money, personColor, initials, fmtDate } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

function getWeekBuckets(n = 8) {
  const now = new Date();
  const dow = now.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - daysToMon);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(mon);
    start.setDate(mon.getDate() - (n - 1 - i) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end, label: `${start.getDate()}/${start.getMonth() + 1}`, amount: 0 };
  });
}

export function Analytics({ group }: { group: Group }) {
  const t = useT();
  const expenses = group.expenses;

  if (expenses.length === 0) {
    return <div className="glass rounded-3xl p-10 text-center text-muted">{t("stats.noData")}</div>;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const avg = total / expenses.length;

  const payerCounts: Record<string, number> = {};
  expenses.forEach((e) => {
    if (e.payments?.length) {
      e.payments.forEach((p) => { payerCounts[p.memberId] = (payerCounts[p.memberId] || 0) + 1; });
    } else {
      payerCounts[e.payerId] = (payerCounts[e.payerId] || 0) + 1;
    }
  });
  const topPayerId = Object.entries(payerCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topPayer = group.members.find((m) => m.id === topPayerId);

  // ── Weekly chart ─────────────────────────────────────────────────────────
  const weeks = getWeekBuckets(8);
  expenses.forEach((e) => {
    const d = new Date(e.date + "T00:00:00");
    const w = weeks.find((w) => d >= w.start && d < w.end);
    if (w) w.amount += e.amount;
  });
  const maxWeek = Math.max(...weeks.map((w) => w.amount), 0.01);

  // ── By person ─────────────────────────────────────────────────────────────
  const paidBy: Record<string, number> = {};
  group.members.forEach((m) => (paidBy[m.id] = 0));
  expenses.forEach((e) => {
    if (e.payments?.length) {
      e.payments.forEach((p) => { paidBy[p.memberId] = (paidBy[p.memberId] || 0) + p.amount; });
    } else {
      paidBy[e.payerId] = (paidBy[e.payerId] || 0) + e.amount;
    }
  });
  const maxPaid = Math.max(...Object.values(paidBy), 0.01);
  const membersSorted = [...group.members].sort((a, b) => paidBy[b.id] - paidBy[a.id]);

  // ── Top expenses ──────────────────────────────────────────────────────────
  const topExpenses = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <div className="space-y-4 anim-up">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t("stats.totalSpent"), value: money(total, group.currency) },
          { label: t("stats.numExpenses"), value: String(expenses.length) },
          { label: t("stats.avgExpense"),  value: money(avg, group.currency) },
        ].map((c) => (
          <div key={c.label} className="glass rounded-2xl p-4">
            <div className="text-xs text-muted font-semibold uppercase tracking-wide mb-1">{c.label}</div>
            <div className="font-mono font-bold text-xl">{c.value}</div>
          </div>
        ))}
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted font-semibold uppercase tracking-wide mb-1">{t("stats.topPayer")}</div>
          {topPayer ? (
            <div className="flex items-center gap-2 mt-1">
              <span
                className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: personColor(topPayer.name) + "22" }}
              >
                {initials(topPayer.name)}
              </span>
              <span className="font-semibold text-sm truncate">{topPayer.name}</span>
            </div>
          ) : <span className="text-muted">—</span>}
        </div>
      </div>

      {/* Weekly spending chart */}
      <section className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted mb-4">{t("stats.byWeek")}</div>
        <div className="flex items-end gap-1.5" style={{ height: 100 }}>
          {weeks.map((w, i) => {
            const hPct = w.amount > 0 ? Math.max(Math.round((w.amount / maxWeek) * 80), 4) : 0;
            const isCurrent = i === weeks.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5" style={{ height: "100%" }}>
                <div className="flex-1 w-full flex items-end">
                  {w.amount > 0 ? (
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: `${hPct}px`,
                        background: isCurrent ? "var(--teal)" : "var(--indigo)",
                        opacity: 0.45 + (i / (weeks.length - 1)) * 0.55,
                      }}
                    />
                  ) : (
                    <div className="w-full rounded-t-md" style={{ height: 3, background: "var(--line)" }} />
                  )}
                </div>
                <div className="text-[9px] text-muted font-mono">{w.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* By person */}
      <section className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("stats.byPerson")}</div>
        <div className="space-y-3">
          {membersSorted.map((m) => {
            const paid = paidBy[m.id] || 0;
            const pct = Math.round((paid / maxPaid) * 100);
            return (
              <div key={m.id}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: personColor(m.name) + "22" }}
                    >
                      {initials(m.name)}
                    </span>
                    {m.name}
                    {m.id === group.meId && <span className="text-muted text-xs">· {t("members.you")}</span>}
                  </span>
                  <span className="font-mono text-sm">{money(paid, group.currency)}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: personColor(m.name), transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top expenses */}
      <section className="glass rounded-3xl p-5">
        <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("stats.topExpenses")}</div>
        <div className="space-y-2.5">
          {topExpenses.map((e, i) => {
            const cat = catOf(e.category);
            return (
              <div key={e.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-mono text-muted w-4 shrink-0 text-center">{i + 1}</span>
                <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 surface-soft text-[color:var(--ink)]">
                  <Icon name={cat.icon} size={16} />
                </div>
                <span className="flex-1 truncate">{e.label}</span>
                <span className="text-xs text-muted shrink-0">{fmtDate(e.date)}</span>
                <span className="font-mono font-semibold shrink-0">{money(e.amount, group.currency)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
