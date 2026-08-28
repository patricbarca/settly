// Freemium plan + AI quota.
//
// The plan (entitlement) is the real source of truth in Supabase: it lives in
// the `entitlements` table and can only be written by the `redeem_access_code`
// SECURITY DEFINER function (see supabase/migrate_v3_plans.sql), so users can't
// self-grant Pro. During the beta, Pro is unlocked by redeeming an access code;
// when Stripe is added later, its webhook writes to the same table and nothing
// here changes.
//
// The monthly AI quota is now server-authoritative: the counter lives in
// Supabase (`ai_usage` table + `consume_ai`/`ai_remaining` RPCs, see
// migrate_v10_ai_usage.sql). The client only caches the "remaining" in memory
// (never localStorage), so clearing browser data no longer resets the quota.
// Strict per-request enforcement inside the AI Edge Functions is a follow-up.
import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

/** Apple prohíbe ofrecer un pago/checkout externo (Stripe) para desbloquear
 *  contenido digital DENTRO de la app nativa (guideline 3.1.1) — el Pro solo
 *  se puede comprar por web o desbloquear con un código de acceso mientras
 *  corre empaquetada en iOS/Android. */
export const isNativePlatform = () => Capacitor.isNativePlatform();

export type Plan = "free" | "pro";
/** Tipos de uso de IA con cuota propia. */
export type AIKind = "scan" | "voice" | "text";
export const FREE_AI_QUOTA = 3;
/** Máximo de grupos activos en el plan gratis (Pro = ilimitado). */
export const FREE_GROUP_LIMIT = 3;
/** Cuota mensual de IA para Pro (por tipo). Se elimina cuando Stripe esté activo. */
export const PRO_AI_QUOTA: Record<AIKind, number> = { scan: 30, voice: 30, text: 50 };

let plan: Plan = "free";
let planReady = false;
let trialEndsAt: Date | null = null;
let hasStripe = false;
/** Pro desbloqueado por una compra In-App (RevenueCat, solo nativo). Se combina
 *  (OR) con el entitlement de Supabase: en iOS/Android la suscripción se compra
 *  vía App Store / Play (guideline 3.1.1) y RevenueCat es la fuente de verdad. */
let nativePro = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function sub(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- plan (entitlement from Supabase) ----------

/** Fallback anti-degradación: verifica el Pro con el RPC `is_pro` (SECURITY
 *  DEFINER → ignora RLS). Solo BAJA a free si el servidor confirma que NO es
 *  Pro; ante un error/timeout deja el plan como está (no strippea un Pro). */
async function verifyProOrKeep(userId: string) {
  try {
    const { data, error } = await supabase.rpc("is_pro", { uid: userId });
    if (error) return; // transitorio → conservar plan actual
    plan = data ? "pro" : "free";
  } catch {
    /* red caída → conservar plan actual (no degradar) */
  }
}

async function loadEntitlement(userId: string) {
  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("plan, expires_at, trial_ends_at, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const active =
        data.plan === "pro" &&
        (!data.expires_at || new Date(data.expires_at) > new Date());
      plan = active ? "pro" : "free";
      trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
      hasStripe = !!data.stripe_customer_id;
    } else {
      // El select directo no vio fila. Puede ser genuino (sin entitlement) o un
      // hueco de sesión donde RLS (auth.uid()) devolvió 0 filas. NO degradamos a
      // ciegas: confirmamos con el RPC definer antes de decidir.
      await verifyProOrKeep(userId);
    }
  } catch {
    // Error transitorio (red/offline/tabla). NUNCA bajar un Pro válido a Free por
    // un fallo pasajero — verificamos por RPC; si también falla, conservamos el
    // plan actual (un re-fetch posterior lo corrige).
    await verifyProOrKeep(userId);
  }
  planReady = true;
  emit();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    loadEntitlement(session.user.id);
    refreshAIQuota();
  } else {
    plan = "free";
    trialEndsAt = null;
    hasStripe = false;
    planReady = true;
    remaining.scan = FREE_AI_QUOTA;
    remaining.voice = FREE_AI_QUOTA;
    remaining.text = FREE_AI_QUOTA;
    emit();
  }
});

/** Plan efectivo = entitlement de Supabase OR compra In-App nativa (RevenueCat). */
function effectivePlan(): Plan {
  return plan === "pro" || nativePro ? "pro" : "free";
}

export function isPro(): boolean {
  return effectivePlan() === "pro";
}

export function usePlan(): Plan {
  return useSyncExternalStore(sub, effectivePlan, effectivePlan);
}

/** Fija el estado Pro proveniente de una compra In-App (llamado por iap.ts). */
export function setNativePro(active: boolean): void {
  if (nativePro === active) return;
  nativePro = active;
  emit();
}

export function usePlanReady(): boolean {
  return useSyncExternalStore(sub, () => planReady, () => planReady);
}

/** Days remaining in trial (null = not in trial or trial already ended). */
export function useTrialDaysLeft(): number | null {
  const snap = () => {
    if (!trialEndsAt || plan !== "pro") return null;
    const ms = trialEndsAt.getTime() - Date.now();
    if (ms <= 0) return null;
    return Math.ceil(ms / 86_400_000);
  };
  return useSyncExternalStore(sub, snap, snap);
}

/** True only when the user is Pro via a Stripe subscription (not an access code). */
export function useHasStripeSubscription(): boolean {
  return useSyncExternalStore(sub, () => hasStripe, () => hasStripe);
}

export type RedeemResult = { ok: boolean; error?: string };

/** Redirect to Stripe Checkout (7-day trial). Returns an error string or null. */
export async function startCheckout(billing: "monthly" | "annual"): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return "not_authenticated";
    const res = await supabase.functions.invoke("create-checkout", {
      body: { billing },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.error) return res.error.message ?? "network";
    const url = (res.data as { url?: string })?.url;
    if (!url) return "no_url";
    window.location.href = url;
    return null;
  } catch {
    return "network";
  }
}

/** Open the Stripe Billing Portal (cancel/change plan/update card). */
export async function startPortal(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return "not_authenticated";
    const res = await supabase.functions.invoke("create-portal-session", {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.error) return res.error.message ?? "network";
    const url = (res.data as { url?: string })?.url;
    if (!url) return "no_url";
    window.location.href = url;
    return null;
  } catch {
    return "network";
  }
}

/** Re-read entitlement from Supabase (call after returning from Stripe success). */
export async function reloadPlan(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await loadEntitlement(user.id);
}

/** Redeem an access code via the Supabase RPC and refresh the local plan. */
export async function redeemCode(code: string): Promise<RedeemResult> {
  const c = code.trim();
  if (!c) return { ok: false, error: "empty" };
  try {
    const { data, error } = await supabase.rpc("redeem_access_code", { p_code: c });
    if (error) return { ok: false, error: "network" };
    const res = (data ?? {}) as { ok?: boolean; error?: string };
    if (res.ok) {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) await loadEntitlement(u.user.id);
      return { ok: true };
    }
    return { ok: false, error: res.error ?? "invalid" };
  } catch {
    return { ok: false, error: "network" };
  }
}

// ---------- AI quota (server-authoritative) ----------
//
// El contador vive en Supabase (`ai_usage` + RPCs `consume_ai`/`ai_remaining`,
// SECURITY DEFINER). El cliente solo cachea el "remaining" en MEMORIA (no en
// localStorage), sembrado desde el servidor al autenticar, así que borrar los
// datos del navegador ya NO resetea la cuota. `consume_ai` es atómico y decide
// Pro vs Free según `entitlements` (fuente de verdad), coincidiendo con las
// constantes de arriba. La reconciliación es optimista: descontamos local al
// instante y ajustamos al valor real que devuelve la RPC.

function quota(kind: AIKind): number {
  return effectivePlan() === "pro" ? PRO_AI_QUOTA[kind] : FREE_AI_QUOTA;
}

// Remaining en memoria por tipo. Se siembra optimista a la cuota free hasta que
// el servidor responde (evita bloquear en el primer render).
const remaining: Record<AIKind, number> = {
  scan: FREE_AI_QUOTA,
  voice: FREE_AI_QUOTA,
  text: FREE_AI_QUOTA,
};

/** Recarga el remaining real desde el servidor (llamar al autenticar). */
export async function refreshAIQuota(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("ai_remaining");
    if (error || !data) return;
    for (const row of data as { kind: AIKind; remaining: number }[]) {
      if (row.kind in remaining) remaining[row.kind] = Math.max(0, row.remaining);
    }
    emit();
  } catch {
    /* offline / RPC ausente → conservar cache optimista */
  }
}

/** Usos de IA restantes este mes para un tipo concreto (Pro = cuota alta). */
export function aiRemaining(kind: AIKind): number {
  return effectivePlan() === "pro" ? quota(kind) : remaining[kind];
}

export function useAIRemaining(kind: AIKind): number {
  const snap = () => aiRemaining(kind);
  return useSyncExternalStore(sub, snap, snap);
}

/** Consume un uso de IA de ese tipo. Devuelve true si se permite; false si la
 *  cuota (según el cache local sembrado del servidor) está agotada. La RPC
 *  atómica es la que realmente cuenta y reconcilia el valor. Pro no consume. */
export function consumeAI(kind: AIKind): boolean {
  if (effectivePlan() === "pro") return true;
  if (remaining[kind] <= 0) return false;
  // Descuento optimista inmediato.
  remaining[kind] = Math.max(0, remaining[kind] - 1);
  emit();
  // Reconciliar con el servidor en segundo plano.
  (async () => {
    try {
      const { data, error } = await supabase.rpc("consume_ai", { p_kind: kind });
      if (error || data == null) return;
      const left = data as number; // remaining tras consumir, o -1 si agotada
      remaining[kind] = left < 0 ? 0 : left;
      emit();
    } catch {
      /* mantener el descuento optimista */
    }
  })();
  return true;
}
