// Centro de avisos in-app (Fase 1). Los eventos viven en el JSON del grupo
// (group.notifications) y se sincronizan vía Supabase Realtime, igual que el
// resto del grupo. El estado "leído" es por dispositivo (localStorage).
import type { AppNotification, Group } from "./types";
import { uid } from "./format";

/** Crea una notificación con id + timestamp. */
export function makeNotif(n: Omit<AppNotification, "id" | "ts">): AppNotification {
  return { ...n, id: uid(), ts: new Date().toISOString() };
}

/** Devuelve la lista de notificaciones del grupo con la nueva añadida (capada). */
export function withNotif(g: Group, n: Omit<AppNotification, "id" | "ts">): AppNotification[] {
  return [...(g.notifications ?? []), makeNotif(n)].slice(-100);
}

export type FeedItem = AppNotification & { groupId: string; groupName: string; currency: string };

/** Aplana las notificaciones de todos los grupos, ocultando las propias del
 *  usuario, ordenadas de más reciente a más antigua. */
export function buildFeed(groups: Group[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const g of groups) {
    for (const n of g.notifications ?? []) {
      if (n.actorId && n.actorId === g.meId) continue; // no me notifico a mí mismo
      items.push({ ...n, groupId: g.id, groupName: g.name, currency: g.currency });
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return items.slice(0, 50);
}

const SEEN_KEY = "settly.notif.seen";

export function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveSeen(seen: Set<string>) {
  try {
    // Guardamos solo los últimos para no crecer sin fin.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  } catch {
    /* localStorage no disponible */
  }
}
