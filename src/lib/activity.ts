// Registro de actividad (log) del grupo. A diferencia de las notificaciones,
// la actividad incluye también las acciones propias y más tipos de evento.
// Vive en el JSON del grupo (group.activity) y se sincroniza vía Supabase
// Realtime, igual que el resto del grupo. No usa estado "leído": es un log.
import type { ActivityEvent, Group } from "./types";
import { uid } from "./format";

/** Crea un evento de actividad con id + timestamp. */
export function makeActivity(e: Omit<ActivityEvent, "id" | "ts">): ActivityEvent {
  return { ...e, id: uid(), ts: new Date().toISOString() };
}

/** Devuelve la lista de actividad del grupo con el nuevo evento añadido (capada). */
export function withActivity(g: Group, e: Omit<ActivityEvent, "id" | "ts">): ActivityEvent[] {
  return [...(g.activity ?? []), makeActivity(e)].slice(-200);
}

export type ActivityItem = ActivityEvent & {
  groupId: string;
  groupName: string;
  currency: string;
  mine: boolean; // true si lo hice yo (para mostrar "Tú")
};

/** Aplana la actividad de todos los grupos, incluida la propia, de más
 *  reciente a más antigua. */
export function buildActivity(groups: Group[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const g of groups) {
    for (const e of g.activity ?? []) {
      items.push({
        ...e,
        groupId: g.id,
        groupName: g.name,
        currency: g.currency,
        mine: !!e.actorId && e.actorId === g.meId,
      });
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return items.slice(0, 100);
}
