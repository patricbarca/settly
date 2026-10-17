import type { Expense, Group, IncomeFreq, RecurrenceInterval } from "./types";
import type { Category } from "./types";
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
  monthly: number; // mi parte al mes (media)
  thisMonth: number; // mi parte en los cobros que caen ESTE mes
  times: number; // cuántos cobros caen este mes
}

const DAY = 86400000;
const parseDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Cuántos cobros de una regla caen en el mes de `now` (contando hacia atrás y
 *  hacia delante desde `nextDate`). Un semanal da 4 o 5, no 4,33. */
export function occurrencesInMonth(nextDate: string, interval: RecurrenceInterval, now = new Date()): number {
  const y = now.getFullYear(), m = now.getMonth();
  const start = Date.UTC(y, m, 1), end = Date.UTC(y, m + 1, 1);
  if (interval === "daily") return (end - start) / DAY;
  if (!/^\d{4}-\d{2}-\d{2}/.test(nextDate || "")) return interval === "weekly" ? 4 : interval === "monthly" ? 1 : 0;
  const base = parseDay(nextDate);
  if (interval === "weekly") {
    const step = 7 * DAY;
    let t = base + Math.ceil((start - base) / step) * step;
    let n = 0;
    for (; t < end; t += step) n++;
    return n;
  }
  const bd = new Date(base);
  if (interval === "monthly") return 1;
  // yearly
  return bd.getUTCMonth() === m ? 1 : 0;
}

/** Cobros de un recurrente PLANIFICADO (sin fecha) en un mes: semanas
 *  completas (4), quincenas (2), 1 mensual; el anual se prorratea. */
export function plannedThisMonth(amount: number, freq: IncomeFreq): number {
  switch (freq) {
    case "weekly": return amount * 4;
    case "biweekly": return amount * 2;
    case "yearly": return amount / 12;
    default: return amount;
  }
}

export const RECURRENT_TEMPLATES: { key: string; category: Category; freq: IncomeFreq }[] = [
  { key: "rent", category: "alojamiento", freq: "weekly" },
  { key: "electricity", category: "servicios", freq: "monthly" },
  { key: "gas", category: "servicios", freq: "monthly" },
  { key: "water", category: "servicios", freq: "monthly" },
  { key: "internet", category: "servicios", freq: "monthly" },
  { key: "phone", category: "servicios", freq: "monthly" },
  { key: "groceries", category: "mercado", freq: "weekly" },
  { key: "transport", category: "transporte", freq: "weekly" },
  { key: "fuel", category: "transporte", freq: "weekly" },
  { key: "gym", category: "salud", freq: "monthly" },
  { key: "streaming", category: "suscripciones", freq: "monthly" },
  { key: "insurance", category: "seguros", freq: "monthly" },
  { key: "loan", category: "prestamos", freq: "monthly" },
];

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
        thisMonth: mine * occurrencesInMonth(r.nextDate, r.interval),
        times: occurrencesInMonth(r.nextDate, r.interval),
      });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Gastos que generó una regla recurrente (id determinista `recur_…`). */
export const isRecurringOccurrence = (expenseId: string) => expenseId.startsWith("recur_");
