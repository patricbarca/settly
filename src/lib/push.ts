// Web Push (Fase 2). Suscribe el navegador a notificaciones push y guarda la
// suscripción en Supabase. El envío lo hace la Edge Function `send-push`.
// La clave pública VAPID es pública (puede ir en el cliente); la privada vive
// SOLO como secreto en Supabase.
import { supabase } from "./supabase";

export const VAPID_PUBLIC_KEY =
  "BLDGef85nn7AZN_xbBDJbE2QVrWJCsWrrpRbyFnzxsQK18E3YKLJ2Ct-_bQuF4Qh1IeZgl-O4QhYVvlSHKH3g7g";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isPushEnabled(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem("settly.push") === "1";
}

export type EnableResult = "ok" | "denied" | "unsupported" | "error";

export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "error";

    // Idioma del usuario (para localizar los recordatorios push diarios).
    const lang =
      typeof localStorage !== "undefined" && localStorage.getItem("settly.lang") === "en" ? "en" : "es";

    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: user.id, endpoint: sub.endpoint, subscription: sub.toJSON(), lang },
      { onConflict: "endpoint" }
    );
    if (error) return "error";

    localStorage.setItem("settly.push", "1");
    return "ok";
  } catch {
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem("settly.push");
  } catch {
    /* ignore */
  }
}

/** Dispara un push a los demás miembros del grupo (la Edge Function resuelve
 *  los destinatarios y excluye al emisor). Fire-and-forget. */
export function notifyGroup(groupId: string, title: string, body: string): void {
  supabase.functions.invoke("send-push", { body: { groupId, title, body } }).catch(() => {});
}
