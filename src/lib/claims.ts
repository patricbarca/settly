// Ronda de auto-asignación ("¿qué consumiste?") de un gasto por ítems.
//
// El reparto REAL lo recalcula el servidor en cada `claim_expense_items`
// (ver supabase/migrate_v14_expense_claims.sql): así seis personas marcando
// sus platos a la vez se serializan en Postgres y ninguna pisa a las demás.
// Lo de aquí es el espejo en TS del mismo cálculo, usado solo para la
// actualización OPTIMISTA (feedback instantáneo); el valor del servidor llega
// después por Realtime y manda.
import type { Expense, ExpenseItem, Group } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Reparto derivado de los ítems: ítem a partes iguales entre quienes lo
 *  comparten, recargos/descuentos proporcional al consumo, propina a partes
 *  iguales. `fallbackIds` = entre quiénes repartir los ítems que nadie ha
 *  reclamado todavía (reparto provisional con la ronda abierta). */
export function itemizedSplits(
  items: ExpenseItem[],
  fees: { amount: number }[] = [],
  tip = 0,
  fallbackIds: string[] | null = null
): Record<string, number> {
  const splits: Record<string, number> = {};
  let itemsTotal = 0;
  for (const it of items) {
    const price = Number(it.price) || 0;
    itemsTotal += price;
    const who = it.participantIds?.length ? it.participantIds : fallbackIds ?? [];
    if (!who.length || price === 0) continue;
    const per = price / who.length;
    who.forEach((id) => (splits[id] = (splits[id] ?? 0) + per));
  }
  const feesTotal = fees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const tipNum = Number(tip) || 0;
  const parts = Object.keys(splits).filter((id) => splits[id] > 0.001);

  if (Math.abs(feesTotal) > 0.001 && itemsTotal > 0) {
    parts.forEach((id) => (splits[id] += feesTotal * (splits[id] / itemsTotal)));
  }
  if (tipNum > 0 && parts.length) {
    const perTip = tipNum / parts.length;
    parts.forEach((id) => (splits[id] += perTip));
  }

  // Redondeo a céntimos; el descuadre va a la parte más grande.
  const total = r2(itemsTotal + feesTotal + tipNum);
  const out: Record<string, number> = {};
  let sumCents = 0;
  let target: string | null = null;
  let best = -1;
  for (const id of Object.keys(splits)) {
    const cents = Math.round(splits[id] * 100);
    out[id] = cents / 100;
    if (cents > 0) {
      sumCents += cents;
      if (splits[id] > best) { best = splits[id]; target = id; }
    }
  }
  const diff = Math.round(total * 100) - sumCents;
  if (diff !== 0 && target) out[target] = r2(out[target] + diff / 100);
  return out;
}

/** Aplica localmente la elección de un miembro (espejo optimista del RPC). */
export function applyClaim(
  exp: Expense,
  memberId: string,
  itemIndexes: number[],
  done: boolean
): Expense {
  const picked = new Set(itemIndexes);
  const items = (exp.items ?? []).map((it, i) => {
    const who = (it.participantIds ?? []).filter((id) => id !== memberId);
    return { ...it, participantIds: picked.has(i) ? [...who, memberId] : who };
  });
  let round = exp.claimRound;
  if (round) {
    const d = (round.done ?? []).filter((id) => id !== memberId);
    round = { ...round, done: done ? [...d, memberId] : d };
  }
  const fallback = round?.status === "open" ? round.expected ?? [] : null;
  const splits = itemizedSplits(items, exp.fees ?? [], exp.tip ?? 0, fallback);
  return {
    ...exp,
    items,
    ...(round ? { claimRound: round } : {}),
    splits,
    participantIds: Object.keys(splits).filter((id) => splits[id] > 0.001),
  };
}

export type ClosePolicy = "all" | "responders" | "keep";

/** Cierra la ronda localmente (espejo optimista de `close_claim_round`). */
export function applyCloseRound(exp: Expense, policy: ClosePolicy): Expense {
  const round = exp.claimRound;
  const fill =
    policy === "responders"
      ? (round?.done?.length ? round.done : round?.expected ?? [])
      : policy === "all"
        ? round?.expected ?? []
        : [];
  const items = (exp.items ?? []).map((it) =>
    !it.participantIds?.length && fill.length ? { ...it, participantIds: fill } : it
  );
  const splits = itemizedSplits(items, exp.fees ?? [], exp.tip ?? 0, null);
  return {
    ...exp,
    items,
    claimRound: { ...(round as NonNullable<typeof round>), status: "closed", closedAt: new Date().toISOString() },
    splits,
    participantIds: Object.keys(splits).filter((id) => splits[id] > 0.001),
  };
}

/** ¿Tengo que elegir todavía en este gasto? */
export function needsMyClaim(exp: Expense, meId: string): boolean {
  const r = exp.claimRound;
  return !!r && r.status === "open" && (r.expected ?? []).includes(meId) && !(r.done ?? []).includes(meId);
}

/** Gastos del grupo con una ronda abierta en la que todavía no he elegido. */
export function pendingClaims(group: Group): Expense[] {
  return group.expenses.filter((e) => needsMyClaim(e, group.meId));
}
