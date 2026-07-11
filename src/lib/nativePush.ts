// Push NATIVO (APNs en iOS, FCM en Android) para la app empaquetada con
// Capacitor. El Web Push (push.ts) sigue sirviendo a la PWA en Safari; esto es
// el canal equivalente para el binario nativo, donde el Web Push no funciona.
// El token del dispositivo se guarda en Supabase (device_push_tokens) y las
// Edge Functions send-push / daily-reminders lo usan para entregar por APNs.
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";
import { getTimezone } from "./tz";

let listenersReady = false;

export type NativePushResult = "ok" | "denied" | "unsupported" | "error";

/** ¿Corre dentro de la app nativa? (solo ahí aplica el push por APNs/FCM). */
export function nativePushSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativePushOn(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem("settly.nativePush") === "1";
}

/** Pide permiso, registra el dispositivo y guarda su token. Idempotente. */
export async function enableNativePush(): Promise<NativePushResult> {
  if (!Capacitor.isNativePlatform()) return "unsupported";
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return "denied";

    if (!listenersReady) {
      listenersReady = true;
      // Token del dispositivo (APNs en iOS) → lo persistimos en Supabase.
      PushNotifications.addListener("registration", (token) => {
        void saveToken(token.value);
      });
      PushNotifications.addListener("registrationError", (err) => {
        console.error("[nativePush] registrationError", err);
      });
      // Al tocar la notificación se abre la app; el enrutado al grupo concreto
      // (usando data.url) se puede añadir en una iteración futura.
      PushNotifications.addListener("pushNotificationActionPerformed", () => {});
    }
    await PushNotifications.register();
    return "ok";
  } catch (e) {
    console.error("[nativePush] enable error", e);
    return "error";
  }
}

/** Reactiva el registro al abrir la app si el usuario ya lo tenía activado
 *  (refresca el token, que Apple puede rotar). No pide permiso de nuevo. */
export async function refreshNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isNativePushOn()) return;
  await enableNativePush();
}

async function saveToken(token: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const lang =
      typeof localStorage !== "undefined" && localStorage.getItem("settly.lang") === "en" ? "en" : "es";
    const platform = Capacitor.getPlatform(); // "ios" | "android"
    await supabase.from("device_push_tokens").upsert(
      { token, user_id: user.id, platform, lang, tz: getTimezone() },
      { onConflict: "token" }
    );
    try { localStorage.setItem("settly.nativePush", "1"); } catch {}
  } catch (e) {
    console.error("[nativePush] saveToken", e);
  }
}

/** Desactiva: borra los tokens de este usuario/plataforma. */
export async function disableNativePush(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("device_push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("platform", Capacitor.getPlatform());
    }
    try { localStorage.removeItem("settly.nativePush"); } catch {}
  } catch (e) {
    console.error("[nativePush] disable error", e);
  }
}
