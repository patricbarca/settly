import type { Expense, Group, IncomeFreq, RecurrenceInterval } from "./types";
import { resolveToCode } from "./currencies";
import { shareFor } from "./split";

/** Importe mensual equivalente. */
export function perMonth(amount: number, freq: IncomeFreq | RecurrenceInterval): number {
  switch (freq) {
    case "daily": return (amount * 365) / 12;
    case "weekly": return (amount * 52) / 12;
    case "biweekly": return (amount * 26) / 12;
    case "yearly": return amount / 12;
    default: return amount;
  }
}

/** Un gasto fijo (recurrente) visto desde "Mis gastos": solo MI parte. */
export interface FixedItem {
  key: string;
  label: string;
  groupId: string;
  groupName: string;
  personal: boolean;
  currency: string;
  amount: number; // mi parte por ocurrencia
  interval: RecurrenceInterval;
  monthly: number; // mi parte al mes
}

/** Recurrentes activos de mis grupos (no archivados) y de mi personal. */
export function fixedItems(groups: Group[], localArchived: Set<string> = new Set()): FixedItem[] {
  const out: FixedItem[] = [];
  for (const g of groups) {
    if (g.deletedAt) continue;
    if (!g.personal && (g.archived || localArchived.has(g.id))) continue;
    const ids = g.members.map((m) => m.id);
    for (const r of g.recurring ?? []) {
      if (!r.active) continue;
      const mine = g.personal
        ? r.amount
        : shareFor({ amount: r.amount, splits: r.splits ?? undefined, participantIds: r.participantIds } as Expense, ids)[g.meId] || 0;
      if (Math.abs(mine) < 0.005) continue;
      out.push({
        key: `${g.id}:${r.id}`,
        label: r.label,
        groupId: g.id,
        groupName: g.name,
        personal: !!g.personal,
        currency: resolveToCode(r.currency || g.currency),
        amount: mine,
        interval: r.interval,
        monthly: perMonth(mine, r.interval),
      });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Gastos que generó una regla recurrente (id determinista `recur_…`). */
export const isRecurringOccurrence = (expenseId: string) => expenseId.startsWith("recur_");
