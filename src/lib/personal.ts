import { supabase } from "./supabase";
import { useEffect } from "react";
import type { Group } from "./types";
import { uid } from "./format";
import { addGroup, useGroups, useGroupsLoading } from "./store";
import { useUser } from "./auth";
import { resolveToCode } from "./currencies";
import { currencyOf, shareFor } from "./split";

/** Grupo privado de "Mis gastos" (una sola persona). */
export const isPersonal = (g: Pick<Group, "personal">): boolean => !!g.personal;

/** Mi grupo personal (el más antiguo si por una carrera entre dispositivos
 *  hubiera dos: los gastos de todos se ven igual en "Mis gastos"). */
export function usePersonalGroup(): Group | undefined {
  const groups = useGroups();
  const mine = groups.filter(isPersonal);
  return mine[mine.length - 1];
}

/** Crea el grupo personal la primera vez que se abre "Mis gastos". Espera a que
 *  carguen los grupos para no duplicarlo. No lo abre: se queda en la pantalla. */
export function useEnsurePersonalGroup(): Group | undefined {
  const groups = useGroups();
  const loading = useGroupsLoading();
  const user = useUser();
  const personal = usePersonalGroup();
  useEffect(() => {
    if (loading || personal || !user) return;
    let cancelled = false;
    (async () => {
      // Antes de crear uno, comprobar en el servidor que de verdad no existe:
      // si la lista local llegó vacía por un fallo, se creaban duplicados.
      if (user.provider !== "guest") {
        const { data, error } = await supabase
          .from("groups").select("id").eq("owner_id", user.id).eq("data->>personal", "true").limit(1);
        if (error || (data && data.length) || cancelled) return;
      }
      if (cancelled) return;
    const count: Record<string, number> = {};
    for (const g of groups) {
      const c = resolveToCode(g.currency);
      count[c] = (count[c] || 0) + 1;
    }
    const common = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    const meId = uid();
    const g: Group = {
      id: uid(),
      name: "Personal",
      currency: user.mainCurrency || common || "EUR",
      kind: "home",
      personal: true,
      // Cada gasto se guarda en su moneda, sin convertir (vista "Por moneda").
      multiCurrency: true,
      meId,
      members: [{ id: meId, name: user.name, avatar: user.avatar || "" }],
      expenses: [],
    };
    addGroup(g, [], { open: false });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, !!personal, !!user]);
  return personal;
}

/** Un gasto visto desde "Mis gastos": solo MI parte. */
export interface MyItem {
  key: string;
  expenseId: string;
  groupId: string;
  groupName: string;
  personal: boolean;
  archived: boolean;
  label: string;
  date: string;
  category: string;
  aiReviewed: boolean;
  fromStatement?: boolean;
  currency: string; // ISO
  amount: number; // mi parte
  total: number; // importe total del gasto
}

/** Mi parte de cada gasto de todos mis grupos (incl. archivados) + los
 *  personales, del más reciente al más antiguo. Lo que adelanté por otros no
 *  cuenta: un gasto de 120 entre 4 me cuenta 30. */
export function myItems(groups: Group[], localArchived: Set<string> = new Set()): MyItem[] {
  const out: MyItem[] = [];
  for (const g of groups) {
    if (g.deletedAt) continue;
    const ids = g.members.map((m) => m.id);
    for (const e of g.expenses) {
      if (e.inbox) continue;
      const mine = g.personal ? e.amount : shareFor(e, ids)[g.meId] || 0;
      if (Math.abs(mine) < 0.005) continue;
      out.push({
        key: `${g.id}:${e.id}`,
        expenseId: e.id,
        groupId: g.id,
        groupName: g.name,
        personal: !!g.personal,
        archived: !g.personal && (!!g.archived || localArchived.has(g.id)),
        label: e.label,
        date: e.date,
        category: e.category,
        aiReviewed: !!e.aiReviewed,
        fromStatement: e.source === "statement" || e.id.startsWith("stm_"),
        currency: currencyOf(e, g),
        amount: mine,
        total: e.amount,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
