import type { Expense, Member, Settlement } from "./types";

/** Cuánto le toca a cada miembro de un gasto concreto. */
export function shareFor(e: Expense, memberIds: string[]): Record<string, number> {
  const owed: Record<string, number> = {};
  memberIds.forEach((m) => (owed[m] = 0));
  if (e.splits) {
    memberIds.forEach((m) => (owed[m] = Number(e.splits![m] || 0)));
    return owed;
  }
  const parts = e.participantIds.length ? e.participantIds : memberIds;
  const per = e.amount / (parts.length || 1);
  parts.forEach((m) => (owed[m] = per));
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
  toId: string
): ExpenseDebt[] {
  const ids = members.map((m) => m.id);
  const paidExpenseIds = new Set<string>();
  for (const s of settlements) {
    if (s.status === "confirmed" && s.from === fromId && s.to === toId) {
      (s.expenseIds ?? []).forEach((id) => paidExpenseIds.add(id));
    }
  }

  const out: ExpenseDebt[] = [];
  for (const e of expenses) {
    if (paidExpenseIds.has(e.id)) continue;
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
    const amount = Math.round(owedShare * frac * 100) / 100;
    if (amount > 0.01) out.push({ expenseId: e.id, label: e.label, amount });
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
): { debtorIds: string[]; settledIds: Set<string> } {
  const sh = shareFor(e, memberIds);
  const payerIds = new Set(e.payments?.length ? e.payments.map((p) => p.memberId) : [e.payerId]);
  const debtorIds = memberIds.filter((id) => (sh[id] || 0) > 0.001 && !payerIds.has(id));
  const settledIds = new Set<string>();
  for (const s of settlements) {
    if (s.status === "confirmed" && s.expenseIds?.includes(e.id)) settledIds.add(s.from);
  }
  return { debtorIds, settledIds };
}
