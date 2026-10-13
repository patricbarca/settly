import type { Expense, Group, Settlement } from "./types";
import { currencyOf } from "./split";
import { resolveToCode } from "./currencies";

// Convertir gastos/pagos de otra moneda a la del grupo, y DESHACERLO.
// Al convertir se guarda una copia exacta de los importes originales
// (`native`), así "Volver a separar" restaura el gasto tal cual estaba, sin
// arrastrar errores de redondeo de ida y vuelta. Además se rellenan
// `originalAmount/originalCurrency/fxRate`, que es lo que ya usa la lista de
// gastos para el aviso "Convertido de…" y el botón "Ver en USD".

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Reparte `total` según los pesos de `parts` y ajusta el céntimo suelto en la
 *  parte mayor, para que la suma convertida cuadre EXACTA con el total. */
function scaleRecord(rec: Record<string, number>, rate: number, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  let biggest = "";
  for (const [k, v] of Object.entries(rec)) {
    out[k] = r2(v * rate);
    sum += out[k];
    if (!biggest || out[k] > out[biggest]) biggest = k;
  }
  if (biggest) out[biggest] = r2(out[biggest] + (total - sum));
  return out;
}

export function canConvert(e: { currency?: string }, group: Group): boolean {
  return currencyOf(e, group) !== resolveToCode(group.currency);
}

export function convertExpense(e: Expense, rate: number): Expense {
  const from = e.currency!;
  const amount = r2(e.amount * rate);
  const payments = e.payments?.length
    ? (() => {
        const rec = scaleRecord(Object.fromEntries(e.payments.map((p) => [p.memberId, p.amount])), rate, amount);
        return e.payments.map((p) => ({ memberId: p.memberId, amount: rec[p.memberId] }));
      })()
    : e.payments;
  return {
    ...e,
    currency: undefined,
    amount,
    payments,
    splits: e.splits ? scaleRecord(e.splits, rate, amount) : e.splits,
    items: e.items?.map((it) => ({ ...it, price: r2(it.price * rate), originalPrice: it.price })),
    fees: e.fees?.map((f) => ({ ...f, amount: r2(f.amount * rate), originalAmount: f.amount })),
    tip: e.tip != null ? r2(e.tip * rate) : e.tip,
    originalAmount: e.amount,
    originalCurrency: from,
    fxRate: rate,
    native: {
      currency: from,
      rate,
      amount: e.amount,
      payments: e.payments,
      splits: e.splits,
      items: e.items,
      fees: e.fees,
      tip: e.tip,
    },
  };
}

export function revertExpense(e: Expense): Expense {
  const n = e.native;
  if (!n) return e;
  return {
    ...e,
    currency: n.currency,
    amount: n.amount,
    payments: n.payments,
    splits: n.splits,
    items: n.items,
    fees: n.fees,
    tip: n.tip,
    originalAmount: undefined,
    originalCurrency: undefined,
    fxRate: undefined,
    native: undefined,
  };
}

export function convertSettlement(s: Settlement, rate: number): Settlement {
  return {
    ...s,
    currency: undefined,
    amount: r2(s.amount * rate),
    expensePayments: s.expensePayments?.map((p) => ({ ...p, amount: r2(p.amount * rate) })),
    native: { currency: s.currency!, rate, amount: s.amount, expensePayments: s.expensePayments },
  };
}

export function revertSettlement(s: Settlement): Settlement {
  const n = s.native;
  if (!n) return s;
  return { ...s, currency: n.currency, amount: n.amount, expensePayments: n.expensePayments, native: undefined };
}

/** Monedas extra que tiene el grupo ahora mismo (las que "Convertir todo" pasaría a la principal). */
export function foreignCurrencies(group: Group): string[] {
  const main = resolveToCode(group.currency);
  const set = new Set<string>();
  for (const e of group.expenses) if (currencyOf(e, group) !== main) set.add(currencyOf(e, group));
  for (const s of group.settlements ?? []) if (currencyOf(s, group) !== main) set.add(currencyOf(s, group));
  return [...set];
}

/** ¿Hay algo convertido que se pueda volver a separar? */
export function hasConverted(group: Group): boolean {
  return group.expenses.some((e) => e.native) || (group.settlements ?? []).some((s) => s.native);
}

/** Convierte TODO lo que está en otra moneda, con una tasa por moneda. */
export function convertAll(group: Group, rates: Record<string, number>): Group {
  const main = resolveToCode(group.currency);
  const rateFor = (x: { currency?: string }) => rates[currencyOf(x, group)];
  return {
    ...group,
    expenses: group.expenses.map((e) =>
      currencyOf(e, group) !== main && rateFor(e) ? convertExpense({ ...e, currency: currencyOf(e, group) }, rateFor(e)) : e
    ),
    settlements: (group.settlements ?? []).map((s) =>
      currencyOf(s, group) !== main && rateFor(s) ? convertSettlement({ ...s, currency: currencyOf(s, group) }, rateFor(s)) : s
    ),
  };
}

/** Deshace "Convertir todo": cada gasto/pago vuelve a su moneda original. */
export function revertAll(group: Group): Group {
  return {
    ...group,
    expenses: group.expenses.map(revertExpense),
    settlements: (group.settlements ?? []).map(revertSettlement),
  };
}

/** Patch para `patchExpense` que deja el gasto EXACTAMENTE como `next`: las
 *  claves que desaparecen se mandan como null (JSON descarta `undefined`, y el
 *  servidor fusiona el patch, así que sin null la clave vieja sobreviviría). */
export function replacePatch<T extends object>(prev: T, next: T): Partial<T> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (k === "id") continue;
    const v = (next as unknown as Record<string, unknown>)[k];
    out[k] = v === undefined ? null : v;
  }
  return out as Partial<T>;
}

/** Patches (uno por gasto/pago que cambió) para pasar de `prev` a `next`. */
export function diffPatches(prev: Group, next: Group) {
  const changed = <T extends { id: string }>(a: T[], b: T[]) =>
    b
      .map((x) => ({ x, old: a.find((o) => o.id === x.id) }))
      .filter(({ x, old }) => old && old !== x)
      .map(({ x, old }) => ({ id: x.id, patch: replacePatch(old!, x) }));
  return {
    expenses: changed(prev.expenses, next.expenses),
    settlements: changed(prev.settlements ?? [], next.settlements ?? []),
  };
}
