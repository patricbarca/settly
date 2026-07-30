// Saldos por AMIGO agregados a través de TODOS tus grupos activos, para la
// pestaña Friends y el "settle general" entre grupos (Pro). Un amigo es un
// usuario registrado (userId) con el que compartes ≥1 grupo. En cada grupo,
// lo que le debes se calcula a nivel de gasto con `expenseDebtsBetween` (las
// deudas reales gasto-a-gasto entre tú y esa persona), para poder elegir qué
// gastos saldar. Requiere sesión (mapeo miembro↔userId vive en group_members).
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useGroups } from "./store";
import {
  computeSettle,
  directTransfers,
  expenseDebtsBetween,
  fifoExpenseIdsForAmount,
  shareFor,
  type ExpenseDebt,
} from "./split";
import { getNetwork } from "./contacts";
import { memberPays } from "./pay";
import { loadArchivedGroups } from "./archivedGroups";
import type { PayMethod } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Recorta una lista de deudas por gasto para que su suma no supere `cap`
 *  (el saldo NETO real que debo a esta persona). Evita ofrecer para saldar
 *  más de lo que realmente se debe cuando la deuda bruta por gasto es mayor
 *  que el neto ya saldado en parte por otra vía. */
function trimTo(list: ExpenseDebt[], cap: number): ExpenseDebt[] {
  let remaining = r2(cap);
  const out: ExpenseDebt[] = [];
  for (const d of list) {
    if (remaining <= 0.01) break;
    const amount = Math.min(d.amount, remaining);
    out.push({ ...d, amount: r2(amount) });
    remaining = r2(remaining - amount);
  }
  return out;
}

/** Un pago que ESTE amigo dice haber hecho y que espera tu confirmación
 *  (tú eres el cobrador). Se puede confirmar/rechazar desde la vista Friends. */
export type PendingConfirm = {
  groupId: string;
  groupName: string;
  settlementId: string;
  amount: number;
  currency: string;
};

export type FriendGroupDebt = {
  groupId: string;
  groupName: string;
  currency: string; // símbolo del grupo (ej. "A$")
  myMemberId: string;
  friendMemberId: string;
  /** Gastos que TÚ le debes a este amigo en este grupo (elegibles al saldar). */
  iOwe: ExpenseDebt[];
  iOweTotal: number;
  theyOweTotal: number;
};

export type Friend = {
  userId: string;
  name: string;
  avatar: string;
  /** Solo grupos donde hay saldo distinto de cero en algún sentido. */
  groups: FriendGroupDebt[];
  /** Neto por moneda: + = le debes, − = te debe. */
  netByCurrency: Record<string, number>;
  /** Métodos de pago del amigo (PayID/banco…) para mostrarlos al saldar. */
  pays: PayMethod[];
  /** Pagos que este amigo hizo y esperan tu confirmación (tú cobras). */
  toConfirm: PendingConfirm[];
};

/** Agrega saldos por amigo cruzando todos los grupos activos del usuario. */
export function useFriends(): { friends: Friend[]; loading: boolean } {
  const groups = useGroups();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const localArch = loadArchivedGroups();
        const active = groups.filter((g) => !g.archived && !g.deletedAt && !localArch.has(g.id));
        if (!user || active.length === 0) {
          if (!cancelled) { setFriends([]); setLoading(false); }
          return;
        }
        const groupIds = active.map((g) => g.id);

        // member_id ↔ user_id por grupo (vive en la tabla group_members).
        const { data: gm } = await supabase
          .from("group_members")
          .select("group_id, user_id, member_id")
          .in("group_id", groupIds);
        const memByGroup = new Map<string, Map<string, string>>(); // groupId -> (userId -> memberId)
        for (const row of gm ?? []) {
          if (!row.user_id || !row.member_id) continue;
          if (!memByGroup.has(row.group_id)) memByGroup.set(row.group_id, new Map());
          memByGroup.get(row.group_id)!.set(row.user_id, row.member_id);
        }

        const network = await getNetwork(); // nombre/avatar por userId
        const info = new Map(network.map((c) => [c.userId, c]));

        const byFriend = new Map<string, Friend>();
        for (const g of active) {
          const map = memByGroup.get(g.id);
          if (!map) continue;
          const myMemberId = map.get(user.id) ?? g.meId;
          if (!myMemberId) continue;
          const settlements = g.settlements ?? [];
          // El saldo real entre dos personas debe salir de las MISMAS
          // transferencias que muestra la pantalla Balances (que ya descuentan
          // todos los pagos confirmados, incluidos los que se hicieron vía el
          // "hub" a través de un tercero en modo Simplificado). Usar la deuda
          // bruta por pareja (`expenseDebtsBetween`) mostraba saldos fantasma
          // en grupos ya saldados. Fuente de verdad única → coincide con Balances.
          const direct = g.simplifyDebts === false;
          const transfers = direct
            ? directTransfers(g.members, g.expenses, settlements)
            : computeSettle(g.members, g.expenses, settlements).transfers;
          const ids = g.members.map((m) => m.id);
          for (const [friendUserId, friendMemberId] of map) {
            if (friendUserId === user.id) continue;
            const iOweThem = r2(
              transfers.filter((x) => x.from === myMemberId && x.to === friendMemberId).reduce((s, x) => s + x.amount, 0)
            );
            const theyOweMe = r2(
              transfers.filter((x) => x.from === friendMemberId && x.to === myMemberId).reduce((s, x) => s + x.amount, 0)
            );
            const netMe = r2(iOweThem - theyOweMe); // + = le debo, − = me debe
            const iOweTotal = netMe > 0 ? netMe : 0;
            const theyOweTotal = netMe < 0 ? -netMe : 0;
            // Lista de gastos para el selector de "Saldar" (solo cuando YO debo).
            // Se toma la deuda por gasto y se recorta al neto real. Si no hay
            // gastos directos con esta persona pero el neto dice que le debo
            // (ruteo puro por hub), se rellena con mis gastos pendientes más
            // antiguos hasta el monto (ids reales, para poder registrarlos).
            let iOwe: ExpenseDebt[] = [];
            if (iOweTotal > 0.005) {
              iOwe = trimTo(
                expenseDebtsBetween(g.members, g.expenses, settlements, myMemberId, friendMemberId),
                iOweTotal
              );
              if (iOwe.length === 0) {
                iOwe = trimTo(
                  fifoExpenseIdsForAmount(g.members, g.expenses, settlements, myMemberId, iOweTotal)
                    .map((id) => {
                      const e = g.expenses.find((x) => x.id === id);
                      return e ? { expenseId: id, label: e.label, amount: r2(shareFor(e, ids)[myMemberId] || 0) } : null;
                    })
                    .filter((d): d is ExpenseDebt => d !== null),
                  iOweTotal
                );
              }
            }
            // Pagos de este amigo pendientes de MI confirmación en este grupo.
            const pendingConfirm = settlements.filter(
              (s) => s.status === "pending" && s.to === myMemberId && s.from === friendMemberId
            );
            if (iOweTotal < 0.005 && theyOweTotal < 0.005 && pendingConfirm.length === 0) continue;
            let f = byFriend.get(friendUserId);
            if (!f) {
              const c = info.get(friendUserId);
              const friendMember = g.members.find((m) => m.id === friendMemberId);
              f = {
                userId: friendUserId,
                name: c?.name ?? friendMember?.name ?? "Usuario",
                avatar: c?.avatar ?? "",
                groups: [],
                netByCurrency: {},
                pays: memberPays(friendMember),
                toConfirm: [],
              };
              byFriend.set(friendUserId, f);
            }
            // Si aún no tenemos métodos de pago del amigo, tomarlos de este grupo.
            if (f.pays.length === 0) f.pays = memberPays(g.members.find((m) => m.id === friendMemberId));
            for (const s of pendingConfirm) {
              f.toConfirm.push({
                groupId: g.id,
                groupName: g.name,
                settlementId: s.id,
                amount: Number(s.amount || 0),
                currency: g.currency,
              });
            }
            if (iOweTotal < 0.005 && theyOweTotal < 0.005) continue;
            f.groups.push({
              groupId: g.id,
              groupName: g.name,
              currency: g.currency,
              myMemberId,
              friendMemberId,
              iOwe,
              iOweTotal,
              theyOweTotal,
            });
            f.netByCurrency[g.currency] = r2((f.netByCurrency[g.currency] ?? 0) + iOweTotal - theyOweTotal);
          }
        }

        const list = [...byFriend.values()].sort((a, b) => {
          const av = Math.max(0, ...Object.values(a.netByCurrency).map(Math.abs));
          const bv = Math.max(0, ...Object.values(b.netByCurrency).map(Math.abs));
          return bv - av;
        });
        if (!cancelled) { setFriends(list); setLoading(false); }
      } catch {
        if (!cancelled) { setFriends([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [groups]);

  return { friends, loading };
}
