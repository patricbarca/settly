// Medición de campañas (Google Ads + TikTok) — SOLO WEB.
//
// Dos reglas que no se pueden romper:
//  1. **Nunca en nativo.** En el binario de Capacitor no se carga NADA: meter
//     un pixel de terceros ahí cambia lo declarado en el App Privacy de Apple
//     (y exigiría ATT). `isNativePlatform()` corta antes de cualquier carga.
//  2. **Inerte sin IDs.** Sin las variables de entorno no se inyecta ningún
//     script ni se envía ningún dato — así el repo no arrastra trackers hasta
//     que se decida activarlos.
//
// Variables (Vite, en el build): VITE_GOOGLE_ADS_ID ("AW-123456789"),
// VITE_TIKTOK_PIXEL_ID, y las etiquetas de conversión VITE_GADS_LABEL_SIGNUP /
// _GROUP / _PRO ("AW-123456789/AbC-D_efGh").
import { isNativePlatform } from "./plan";

type W = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  ttq?: { track: (e: string, p?: Record<string, unknown>) => void; page: () => void };
};

const env = import.meta.env as Record<string, string | undefined>;
const GOOGLE_ADS = env.VITE_GOOGLE_ADS_ID ?? "";
const TIKTOK = env.VITE_TIKTOK_PIXEL_ID ?? "";
const LABELS: Record<string, string> = {
  signup: env.VITE_GADS_LABEL_SIGNUP ?? "",
  group_created: env.VITE_GADS_LABEL_GROUP ?? "",
  pro: env.VITE_GADS_LABEL_PRO ?? "",
};

const hasGoogle = /^AW-\d+$/.test(GOOGLE_ADS);
const hasTikTok = !!TIKTOK;
let ready = false;

/** Carga los pixels una sola vez. No-op en nativo o sin IDs configurados. */
export function initAdTracking(): void {
  if (ready || typeof window === "undefined") return;
  if (isNativePlatform()) return;
  if (!hasGoogle && !hasTikTok) return;
  ready = true;
  const w = window as W;

  if (hasGoogle) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS}`;
    document.head.appendChild(s);
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) { w.dataLayer!.push(args); };
    w.gtag("js", new Date());
    w.gtag("config", GOOGLE_ADS, { allow_enhanced_conversions: true });
  }

  if (hasTikTok) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${TIKTOK}&lib=ttq`;
    document.head.appendChild(s);
  }
}

/** Eventos de conversión. Los nombres de TikTok son los estándar de su catálogo
 *  (usar otros hace que el optimizador no los reconozca). */
const TIKTOK_EVENT: Record<string, string> = {
  signup: "CompleteRegistration",
  group_created: "SubmitForm",
  pro: "Subscribe",
};

export function trackConversion(
  event: "signup" | "group_created" | "pro",
  params?: { value?: number; currency?: string }
): void {
  if (!ready) return;
  const w = window as W;
  try {
    if (hasGoogle && LABELS[event]) {
      w.gtag?.("event", "conversion", {
        send_to: LABELS[event],
        ...(params?.value != null ? { value: params.value, currency: params.currency ?? "USD" } : {}),
      });
    }
    if (hasTikTok && w.ttq) {
      w.ttq.track(TIKTOK_EVENT[event], params?.value != null
        ? { value: params.value, currency: params.currency ?? "USD" }
        : undefined);
    }
  } catch {
    /* la medición nunca puede romper la app */
  }
}
