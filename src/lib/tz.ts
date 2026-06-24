// Zona horaria del usuario (preferencia de perfil). Se guarda por dispositivo
// en localStorage. "auto" = la del dispositivo. Se usa para mostrar fechas/horas
// de notificaciones y actividad en la zona que cada usuario elija.
import { useSyncExternalStore } from "react";

const KEY = "settly.tz";

function detect(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

let pref: string = load();
const listeners = new Set<() => void>();

function load(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v;
  } catch {}
  return "auto";
}

function emit() {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Resuelve "auto" a la zona del dispositivo. */
export function resolveTz(p: string): string {
  return !p || p === "auto" ? detect() : p;
}

export function setTimezone(p: string) {
  pref = p;
  emit();
}

/** Preferencia cruda ("auto" o una zona IANA) — para el selector del perfil. */
export function useTimezonePref(): string {
  return useSyncExternalStore(subscribe, () => pref, () => pref);
}

/** Zona horaria efectiva ya resuelta — para formatear fechas. */
export function useTimezone(): string {
  return resolveTz(useTimezonePref());
}

export function getTimezone(): string {
  return resolveTz(pref);
}

/** Lista de zonas IANA disponibles (todas si el navegador las expone). */
export const TIMEZONES: string[] = (() => {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof sv === "function") return sv("timeZone");
  } catch {}
  return [
    "UTC",
    "Europe/Madrid", "Europe/London", "Europe/Paris", "Europe/Berlin",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Mexico_City", "America/Bogota", "America/Lima", "America/Santiago",
    "America/Argentina/Buenos_Aires", "America/Sao_Paulo",
    "Australia/Sydney", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
  ];
})();

// ── Helpers de fecha/hora en una zona dada ──────────────────────────────────

/** Clave de día "YYYY-MM-DD" en la zona dada (para agrupar). */
export function dayKey(ts: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/** Hora "14:30" en la zona dada. */
export function timeLabel(ts: string, tz: string, lang: "es" | "en"): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** Cabecera de fecha: "Hoy" / "Ayer" / "12 jun 2026" en la zona dada. */
export function dayLabel(ts: string, tz: string, lang: "es" | "en"): string {
  const key = dayKey(ts, tz);
  const now = new Date();
  const todayKey = dayKey(now.toISOString(), tz);
  const yestKey = dayKey(new Date(now.getTime() - 86400000).toISOString(), tz);
  if (key === todayKey) return lang === "es" ? "Hoy" : "Today";
  if (key === yestKey) return lang === "es" ? "Ayer" : "Yesterday";
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ts));
}
