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
  nextDate: string; // próximo cobro (para proyectar semanas/meses futuros)
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
        nextDate: r.nextDate,
      });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Gastos que generó una regla recurrente (id determinista `recur_…`). */
export const isRecurringOccurrence = (expenseId: string) => expenseId.startsWith("recur_");

/** Importe semanal equivalente (para la vista por semanas). */
export function perWeek(amount: number, freq: IncomeFreq | RecurrenceInterval): number {
  switch (freq) {
    case "daily": return amount * 7;
    case "weekly": return amount;
    case "biweekly": return amount / 2;
    case "yearly": return amount / 52;
    default: return (amount * 12) / 52;
  }
}

/** Cobros REALES de una regla con fecha entre [start, end) (ms UTC). Un mensual
 *  cae el mismo día de cada mes; un semanal cada 7 días desde nextDate. */
export function occurrencesBetween(nextDate: string, interval: RecurrenceInterval, start: number, end: number): number {
  if (interval === "daily") return Math.round((end - start) / DAY);
  if (!/^\d{4}-\d{2}-\d{2}/.test(nextDate || "")) return Math.round(perWeek(1, interval) * ((end - start) / (7 * DAY)));
  const base = parseDay(nextDate);
  if (interval === "weekly") {
    const step = 7 * DAY;
    let n = 0;
    for (let t = base + Math.ceil((start - base) / step) * step; t < end; t += step) n++;
    return n;
  }
  const bd = new Date(base);
  const months = interval === "monthly" ? 1 : 12;
  let n = 0;
  const s = new Date(start), e = new Date(end);
  for (let y = s.getUTCFullYear() - 1; y <= e.getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      const diff = (y - bd.getUTCFullYear()) * 12 + (m - bd.getUTCMonth());
      if (diff % months !== 0) continue;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const t = Date.UTC(y, m, Math.min(bd.getUTCDate(), last));
      if (t >= start && t < end) n++;
    }
  }
  return n;
}

export interface YearPeriod {
  label: string;
  start: number; // ms UTC
  end: number;
  current: boolean;
}

/** Próximos 12 meses (desde el actual) o próximas 52 semanas (lunes a domingo). */
export function yearPeriods(by: "month" | "week", lang: string, now = new Date()): YearPeriod[] {
  const out: YearPeriod[] = [];
  const loc = lang === "en" ? "en-US" : "es-ES";
  if (by === "month") {
    for (let k = 0; k < 12; k++) {
      const s = Date.UTC(now.getFullYear(), now.getMonth() + k, 1);
      const e = Date.UTC(now.getFullYear(), now.getMonth() + k + 1, 1);
      out.push({ label: new Date(s).toLocaleDateString(loc, { month: "short", timeZone: "UTC" }).replace(".", ""), start: s, end: e, current: k === 0 });
    }
  } else {
    const dow = (now.getDay() + 6) % 7;
    const mon = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    for (let k = 0; k < 52; k++) {
      const s = mon + k * 7 * DAY;
      const d = new Date(s);
      out.push({ label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, start: s, end: s + 7 * DAY, current: k === 0 });
    }
  }
  return out;
}
