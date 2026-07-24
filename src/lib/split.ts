import type { Expense, Member, Settlement } from "./types";

/** Cuánto le toca a cada miembro de un gasto concreto. Reparto EXACTO en
 *  centavos: si no divide justo (ej. $10 entre 3), el o los centavos sueltos
 *  se asignan a los primeros participantes de la lista (orden determinista)
 *  en vez de dejar decimales infinitos que luego arrastran error de
 *  redondeo hasta aparecer como saldos fantasma de $0.01. */
export function shareFor(e: Expense, memberIds: string[]): Record<string, number> {
  const owed: Record<string, number> = {};
  memberIds.forEach((m) => (owed[m] = 0));
  if (e.splits) {
    memberIds.forEach((m) => (owed[m] = Number(e.splits![m] || 0)));
    return owed;
  }
  const parts = e.participantIds.length ? e.participantIds : memberIds;
  const n = parts.length || 1;
  const totalCents = Math.round(e.amount * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;
  parts.forEach((m, i) => {
    const cents = baseCents + (i < remainderCents ? 1 : 0);
    owed[m] = cents / 100;
  });
  return owed;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface Settlement_ {
  paid: Record<string, number>;
  owed: Record<string, number>;
  net: Record<string, number>;
  transfers: Transfer[];
}

/** Saldos por persona + reparto con el mínimo de transferencias.
 *  Los pagos ya confirmados (settlements) reducen las deudas. */
export function computeSettle(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[] = []
): Settlement_ {
  const ids = members.map((m) => m.id);
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  ids.forEach((id) => {
    paid[id] = 0;
    owed[id] = 0;
  });

  for (const e of expenses) {
    if (e.payments?.length) {
      for (const p of e.payments) {
        if (paid[p.memberId] != null) paid[p.memberId] += Number(p.amount || 0);
      }
    } else if (paid[e.payerId] != null) {
      paid[e.payerId] += Number(e.amount || 0);
    }
    const sh = shareFor(e, ids);
    ids.forEach((id) => (owed[id] += sh[id] || 0));
  }

  // un pago confirmado: 'from' salda su deuda con 'to'
  for (const s of settlements) {
    if (s.status !== "confirmed") continue;
    if (paid[s.from] != null) paid[s.from] += Number(s.amount || 0);
    if (owed[s.to] != null) owed[s.to] += Number(s.amount || 0);
  }

  const net: Record<string, number> = {};
  ids.forEach((id) => (net[id] = Math.round((paid[id] - owed[id]) * 100) / 100));

  const cred: { id: string; v: number }[] = [];
  const deb: { id: string; v: number }[] = [];
  ids.forEach((id) => {
    if (net[id] > 0.01) cred.push({ id, v: net[id] });
    else if (net[id] < -0.01) deb.push({ id, v: -net[id] });
  });
  cred.sort((a, b) => b.v - a.v);
  deb.sort((a, b) => b.v - a.v);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < deb.length && j < cred.length) {
    const amt = Math.min(deb[i].v, cred[j].v);
    transfers.push({ from: deb[i].id, to: cred[j].id, amount: Math.round(amt * 100) / 100 });
    deb[i].v -= amt;
    cred[j].v -= amt;
    if (deb[i].v < 0.01) i++;
    if (cred[j].v < 0.01) j++;
  }

  return { paid, owed, net, transfers };
}

/** Pagos DIRECTOS: cada participante paga a quien realmente puso el dinero de
 *  cada gasto (sin re-enrutar entre desconocidos como hace la simplificación).
 *  Devuelve las transferencias ya neteadas por pareja. */
export function directTransfers(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[] = []
): Transfer[] {
  const ids = members.map((m) => m.id);
  // debt[from][to] = cuánto debe 'from' a 'to'
  const debt: Record<string, Record<string, number>> = {};
  const add = (from: string, to: string, amt: number) => {
    if (from === to || amt <= 0) return;
    (debt[from] ??= {})[to] = (debt[from][to] || 0) + amt;
  };

  for (const e of expenses) {
    const pays = e.payments?.length
      ? e.payments
      : [{ memberId: e.payerId, amount: Number(e.amount || 0) }];
    const totalPaid = pays.reduce((s, p) => s + Number(p.amount || 0), 0) || Number(e.amount || 0) || 1;
    const sh = shareFor(e, ids);
    for (const pid of ids) {
      const s = sh[pid] || 0;
      if (s <= 0) continue;
      // 'pid' debe su parte repartida entre los pagadores según cuánto puso cada uno.
      for (const p of pays) {
        const frac = Number(p.amount || 0) / totalPaid;
        add(pid, p.memberId, s * frac);
      }
    }
  }

  // Pagos confirmados: 'from' ya pagó a 'to' → reduce esa deuda.
  for (const s of settlements) {
    if (s.status !== "confirmed") continue;
    add(s.to, s.from, Number(s.amount || 0));
  }

  // Netear cada pareja y construir las transferencias.
  const transfers: Transfer[] = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue; // cada pareja una vez
      const net = Math.round(((debt[a]?.[b] || 0) - (debt[b]?.[a] || 0)) * 100) / 100;
      if (net > 0.01) transfers.push({ from: a, to: b, amount: net });
      else if (net < -0.01) transfers.push({ from: b, to: a, amount: -net });
    }
  }
  return transfers;
}

export interface ExpenseDebt {
  expenseId: string;
  label: string;
  amount: number;
}

/** Monto ya saldado (por pagos CONFIRMADOS de `fromId`) hacia un gasto concreto.
 *  Cuenta pagos parciales (`expensePayments`) y, por compatibilidad, pagos
 *  antiguos que solo referencian `expenseIds` (se toman como cobertura total =
 *  `owedShare`). Si se pasa `toId`, solo cuenta pagos a ese acreedor. */
function paidTowardExpense(
  settlements: Settlement[],
  fromId: string,
  expenseId: string,
  owedShare: number,
  toId?: string,
  excludeSettlementId?: string
): number {
  let paid = 0;
  for (const s of settlements) {
    if (s.id === excludeSettlementId) continue;
    if (s.status !== "confirmed" || s.from !== fromId) continue;
    if (toId && s.to !== toId) continue;
    const ep = s.expensePayments?.find((x) => x.expenseId === expenseId);
    if (ep) paid += Number(ep.amount || 0);
    else if (s.expenseIds?.includes(expenseId)) paid += owedShare; // legacy: entero
  }
  return Math.round(paid * 100) / 100;
}

/** Desglose de qué gastos concretos componen lo que 'fromId' le debe a
 *  'toId' (modo Directo) — excluye los ya cubiertos por un pago CONFIRMADO
 *  entre ese mismo par que los referencia en `expenseIds`. Se usa para dejar
 *  elegir gastos concretos al pagar/marcar como pagado (en vez de un monto
 *  suelto), y para saber qué gastos siguen pendientes. */
export function expenseDebtsBetween(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
  fromId: string,
  toId: string,
  /** Settlement a ignorar al calcular qué ya está cubierto (para poder editar
   *  sus propios gastos sin que se auto-excluyan). */
  excludeSettlementId?: string
): ExpenseDebt[] {
  const ids = members.map((m) => m.id);
  const out: ExpenseDebt[] = [];
  for (const e of expenses) {
    const sh = shareFor(e, ids);
    const owedShare = sh[fromId] || 0;
    if (owedShare <= 0.001) continue;
    const pays = e.payments?.length
      ? e.payments
      : [{ memberId: e.payerId, amount: Number(e.amount || 0) }];
    const totalPaid = pays.reduce((s, p) => s + Number(p.amount || 0), 0) || Number(e.amount || 0) || 1;
    const toPay = pays.find((p) => p.memberId === toId);
    if (!toPay) continue;
    const frac = Number(toPay.amount || 0) / totalPaid;
    const owedToCreditor = Math.round(owedShare * frac * 100) / 100;
    if (owedToCreditor <= 0.01) continue;
    // Resta lo ya pagado hacia este gasto (a este acreedor) → queda el pendiente.
    const paid = paidTowardExpense(settlements, fromId, e.id, owedToCreditor, toId, excludeSettlementId);
    const remaining = Math.round((owedToCreditor - paid) * 100) / 100;
    if (remaining > 0.01) out.push({ expenseId: e.id, label: e.label, amount: remaining });
  }
  return out;
}

/** Para un gasto dado, quiénes lo deben (participantes con parte > 0 que no
 *  son quien(es) pagaron) y cuáles de ellos ya lo saldaron vía un pago
 *  confirmado que referencia este gasto — para el indicador "pagado" en el
 *  listado de gastos. */
export function expenseSettledStatus(
  e: Expense,
  memberIds: string[],
  settlements: Settlement[]
): { debtorIds: string[]; settledIds: Set<string>; partialIds: Set<string> } {
  const sh = shareFor(e, memberIds);
  const payerIds = new Set(e.payments?.length ? e.payments.map((p) => p.memberId) : [e.payerId]);
  const debtorIds = memberIds.filter((id) => (sh[id] || 0) > 0.001 && !payerIds.has(id));
  // "settled" = pagó su parte ENTERA; "partial" = pagó algo pero no todo.
  const settledIds = new Set<string>();
  const partialIds = new Set<string>();
  for (const id of debtorIds) {
    const owedShare = sh[id] || 0;
    const paid = paidTowardExpense(settlements, id, e.id, owedShare);
    if (paid >= owedShare - 0.01) settledIds.add(id);
    else if (paid > 0.01) partialIds.add(id);
  }
  return { debtorIds, settledIds, partialIds };
}

/** Modo Simplificado: una transferencia es una optimización agregada que no
 *  siempre corresponde a un gasto real entre ese par exacto, así que no se
 *  puede dejar elegir gastos concretos como en Directo. En su lugar, al
 *  marcar un pago se asignan automáticamente los gastos pendientes de
 *  'fromId' del más ANTIGUO al más nuevo, hasta agotar el monto pagado —
 *  solo se marcan como cubiertos los que caben enteros (no se parte un
 *  gasto), dejando el resto para el próximo pago. */
export function fifoExpenseIdsForAmount(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
  fromId: string,
  amount: number
): string[] {
  const ids = members.map((m) => m.id);
  const alreadySettled = new Set<string>();
  for (const s of settlements) {
    if (s.status === "confirmed" && s.from === fromId) {
      (s.expenseIds ?? []).forEach((id) => alreadySettled.add(id));
    }
  }

  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  let remaining = amount;
  const out: string[] = [];
  for (const e of sorted) {
    if (alreadySettled.has(e.id)) continue;
    const owedShare = shareFor(e, ids)[fromId] || 0;
    if (owedShare <= 0.01) continue;
    if (owedShare <= remaining + 0.01) {
      out.push(e.id);
      remaining -= owedShare;
    } else {
      break;
    }
  }
  return out;
}

/** Modo Simplificado: en vez de escribir un monto suelto (que puede no
 *  coincidir con ninguna combinación real de gastos), se listan los propios
 *  gastos pendientes de 'fromId' — sin importar quién los pagó — para que
 *  la persona elija cuáles saldar. El monto a pagar es SIEMPRE la suma
 *  exacta de lo elegido, nunca un número arbitrario. Ordenado del más
 *  antiguo al más nuevo para que el preselect por defecto (FIFO) tenga
 *  sentido visualmente. */
export function myPendingExpenses(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
  fromId: string
): ExpenseDebt[] {
  const ids = members.map((m) => m.id);
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const out: ExpenseDebt[] = [];
  for (const e of sorted) {
    const payerIds = new Set(e.payments?.length ? e.payments.map((p) => p.memberId) : [e.payerId]);
    if (payerIds.has(fromId)) continue;
    const owedShare = shareFor(e, ids)[fromId] || 0;
    if (owedShare <= 0.005) continue;
    // Descuenta lo ya pagado hacia este gasto (parcial o total) → pendiente.
    const paid = paidTowardExpense(settlements, fromId, e.id, owedShare);
    const remaining = Math.round((owedShare - paid) * 100) / 100;
    if (remaining > 0.005) out.push({ expenseId: e.id, label: e.label, amount: remaining });
  }
  return out;
}
