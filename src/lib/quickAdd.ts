// "Añadir rápido" desde fuera de la app: Siri, la app Atajos, el Botón de
// Acción o la automatización de Wallet (pagar con Apple Pay). Todo eso entra
// por las App Intents nativas (ios/App/App/SettliaIntents.swift), que abren la
// app con un deep link:
//
//   app.settlia.pwa://add?text=<nota>&id=<uuid>   → interpreta la nota
//   app.settlia.pwa://scan?id=<uuid>              → abre el escáner de tickets
//
// Aquí lo guardamos como "pendiente" hasta que haya un grupo abierto: si tienes
// varios, App.tsx te pregunta a cuál va; AddExpense lo recoge y lanza el flujo
// normal (IA + revisar y confirmar). Nunca se guarda un gasto sin que lo veas.
import { useSyncExternalStore } from "react";

/** `groupId` = a qué grupo va. Vacío mientras no se haya elegido: así un gasto
 *  dictado a Siri nunca cae en silencio en el último grupo que dejaste abierto. */
export type QuickAdd = (
  | { kind: "text"; text: string }
  /** `paid` = lo cobrado en la tarjeta (automatización de Wallet). El escáner lo
   *  usa para comprobar que el ticket leído suma lo mismo. */
  | { kind: "scan"; paid?: number; merchant?: string }
) & { groupId?: string };

/** Importe tal como lo entrega Wallet/Atajos, en el formato del iPhone:
 *  "A$48.00", "48,00 $", "$1,234.56", "1.234,56 €", "200.000 ₫". El ÚLTIMO
 *  separador es decimal solo si le siguen 1-2 cifras; si le siguen 3, es de
 *  miles (si no, "200.000 ₫" se leería como 200). */
export function parseMoney(raw: string | null | undefined): number | undefined {
  const m = (raw || "").replace(/\s/g, "").match(/\d[\d.,]*/);
  if (!m) return undefined;
  let s = m[0].replace(/[.,]$/, "");
  const dec = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const after = dec >= 0 ? s.length - dec - 1 : 0;
  if (dec >= 0 && after >= 1 && after <= 2) s = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1);
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

const SCHEME = "app.settlia.pwa:";
const KEY = "settlia.quickAdd";
const SEEN = "settlia.quickAdd.seen";

/** Ids ya procesados. Capacitor recuerda el último URL abierto y lo devuelve en
 *  getLaunchUrl(); si la web se recarga (p. ej. al actualizarse la PWA) el mismo
 *  enlace volvería a entrar y abriría otro gasto. El id lo hace idempotente. */
function seen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN) || "[]");
  } catch {
    return [];
  }
}
function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN, JSON.stringify([id, ...seen().filter((x) => x !== id)].slice(0, 20)));
  } catch {
    /* ignore */
  }
}

function read(): QuickAdd | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuickAdd) : null;
  } catch {
    return null;
  }
}

let current: QuickAdd | null = read();
const listeners = new Set<() => void>();
function emit() {
  current = read();
  listeners.forEach((l) => l());
}

function store(q: QuickAdd | null) {
  try {
    if (q) sessionStorage.setItem(KEY, JSON.stringify(q));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Devuelve true si el URL era un "añadir rápido" (para no seguir con OAuth). */
export function captureQuickAddFromUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== SCHEME) return false;
  // En esquemas propios WebKit pone "add" en host; por si acaso, también path.
  const route = (u.host || u.pathname.replace(/^\/+/, "")).toLowerCase();
  if (route !== "add" && route !== "scan") return false;

  const id = u.searchParams.get("id") || "";
  if (id && seen().includes(id)) return true; // ya procesado: se ignora, pero es nuestro
  if (id) markSeen(id);

  if (route === "scan") {
    const paid = parseMoney(u.searchParams.get("paid"));
    const merchant = (u.searchParams.get("merchant") || "").trim().slice(0, 80) || undefined;
    store({ kind: "scan", ...(paid ? { paid } : {}), ...(merchant ? { merchant } : {}) });
    return true;
  }
  const text = (u.searchParams.get("text") || "").trim().slice(0, 200);
  if (!text) return true;
  store({ kind: "text", text });
  return true;
}

export function peekQuickAdd(): QuickAdd | null {
  return current;
}

/** Lo recoge quien lo va a usar (AddExpense). Se borra para que no se repita. */
export function takeQuickAdd(): QuickAdd | null {
  const q = current;
  if (q) store(null);
  return q;
}

/** Fija el grupo destino (lo elige el usuario, o es el único que tiene). */
export function assignQuickAdd(groupId: string) {
  if (current) store({ ...current, groupId });
}

export function clearQuickAdd() {
  store(null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useQuickAdd(): QuickAdd | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
