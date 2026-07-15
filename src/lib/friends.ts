// Saldos por AMIGO agregados a través de TODOS tus grupos activos, para la
// pestaña Friends y el "settle general" entre grupos (Pro). Un amigo es un
// usuario registrado (userId) con el que compartes ≥1 grupo. En cada grupo,
// lo que le debes se calcula a nivel de gasto con `expenseDebtsBetween` (las
// deudas reales gasto-a-gasto entre tú y esa persona), para poder elegir qué
// gastos saldar. Requiere sesión (mapeo miembro↔userId vive en group_members).
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useGroups } from "./store";
import { expenseDebtsBetween, type ExpenseDebt } from "./split";
import { getNetwork } from "./contacts";
import { memberPays } from "./pay";
import { loadArchivedGroups } from "./archivedGroups";
import type { PayMethod } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

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
          for (const [friendUserId, friendMemberId] of map) {
            if (friendUserId === user.id) continue;
            const iOwe = expenseDebtsBetween(g.members, g.expenses, settlements, myMemberId, friendMemberId);
            const theyOwe = expenseDebtsBetween(g.members, g.expenses, settlements, friendMemberId, myMemberId);
            const iOweTotal = r2(iOwe.reduce((s, d) => s + d.amount, 0));
            const theyOweTotal = r2(theyOwe.reduce((s, d) => s + d.amount, 0));
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
