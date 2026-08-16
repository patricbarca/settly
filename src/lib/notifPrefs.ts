// Preferencias de notificaciones por usuario (qué categorías quiere recibir).
// Fuente de verdad: `profiles.notif_prefs` (jsonb) en Supabase, para que las
// Edge Functions (send-push / daily-reminders) puedan respetarlas al enviar
// push. Se cachea en localStorage para lectura instantánea y para filtrar el
// feed in-app (que se calcula en el cliente). Falta una categoría = activada.
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

export type NotifCategory = "expenses" | "payments" | "requests" | "reminders";
export const NOTIF_CATEGORIES: NotifCategory[] = ["expenses", "payments", "requests", "reminders"];

// Tipo interno de notificación → categoría visible para el usuario.
const TYPE_CATEGORY: Record<string, NotifCategory> = {
  expense_added: "expenses",
  recurring_generated: "expenses",
  payment_made: "payments",
  payment_rejected: "payments",
  review_requested: "requests",
  delete_requested: "requests",
};

export function categoryOf(type: string): NotifCategory {
  return TYPE_CATEGORY[type] ?? "expenses";
}

type Prefs = Record<NotifCategory, boolean>;
const DEFAULT: Prefs = { expenses: true, payments: true, requests: true, reminders: true };
const KEY = "settly.notifprefs";

let prefs: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT };
}
function persistLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
function emit() { listeners.forEach((l) => l()); }

export function getNotifPrefs(): Prefs { return prefs; }
export function isCategoryOn(cat: NotifCategory): boolean { return prefs[cat] !== false; }

/** Cambia una categoría y la persiste (local + Supabase). */
export function setNotifPref(cat: NotifCategory, on: boolean): void {
  prefs = { ...prefs, [cat]: on };
  persistLocal();
  emit();
  supabase.auth.getUser().then(({ data }) => {
    if (data.user) {
      supabase.from("profiles").update({ notif_prefs: prefs }).eq("id", data.user.id).then(() => {}, () => {});
    }
  });
}

/** Aplica las prefs traídas de la BD (al iniciar sesión). Tolerante a null. */
export function applyNotifPrefsFromDB(p: unknown): void {
  if (p && typeof p === "object") {
    prefs = { ...DEFAULT, ...(p as Partial<Prefs>) };
    persistLocal();
    emit();
  }
}

export function useNotifPrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => prefs,
    () => prefs
  );
}
