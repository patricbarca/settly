// Freemium plan + AI quota.
//
// The plan (entitlement) is the real source of truth in Supabase: it lives in
// the `entitlements` table and can only be written by the `redeem_access_code`
// SECURITY DEFINER function (see supabase/migrate_v3_plans.sql), so users can't
// self-grant Pro. During the beta, Pro is unlocked by redeeming an access code;
// when Stripe is added later, its webhook writes to the same table and nothing
// here changes.
//
// The monthly AI quota stays client-side for now (good enough until the LLM
// endpoint enforces it server-side).
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

export type Plan = "free" | "pro";
export const FREE_AI_QUOTA = 3;
/** Máximo de grupos activos en el plan gratis (Pro = ilimitado). */
export const FREE_GROUP_LIMIT = 3;

const USAGE_KEY = "settly.aiUsage";
/** Tipos de uso de IA con cuota propia en el plan gratis (3 de cada uno). */
export type AIKind = "scan" | "voice" | "text";
type Usage = { month: string; scan: number; voice: number; text: number };

let plan: Plan = "free";
let planReady = false;
let trialEndsAt: Date | null = null;
let usage: Usage = loadUsage();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function sub(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- plan (entitlement from Supabase) ----------

async function loadEntitlement(userId: string) {
  try {
    const { data } = await supabase
      .from("entitlements")
      .select("plan, expires_at, trial_ends_at")
      .eq("user_id", userId)
      .maybeSingle();
    const active =
      !!data &&
      data.plan === "pro" &&
      (!data.expires_at || new Date(data.expires_at) > new Date());
    plan = active ? "pro" : "free";
    trialEndsAt = data?.trial_ends_at ? new Date(data.trial_ends_at) : null;
  } catch {
    // Table missing (migration not applied yet) or offline → default to free.
    plan = "free";
    trialEndsAt = null;
  }
  planReady = true;
  emit();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    loadEntitlement(session.user.id);
  } else {
    plan = "free";
    trialEndsAt = null;
    planReady = true;
    emit();
  }
});

export function isPro(): boolean {
  return plan === "pro";
}

export function usePlan(): Plan {
  return useSyncExternalStore(sub, () => plan, () => plan);
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

// ---------- AI quota (local) ----------

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function loadUsage(): Usage {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const u = JSON.parse(raw) as Partial<Usage>;
      if (u && u.month === thisMonth()) {
        return { month: u.month, scan: u.scan || 0, voice: u.voice || 0, text: u.text || 0 };
      }
    }
  } catch {}
  return { month: thisMonth(), scan: 0, voice: 0, text: 0 };
}

function saveUsage() {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {}
}

function rollover() {
  if (usage.month !== thisMonth()) {
    usage = { month: thisMonth(), scan: 0, voice: 0, text: 0 };
    saveUsage();
  }
}

/** Usos de IA restantes este mes para un tipo concreto (Pro = ilimitado). */
export function aiRemaining(kind: AIKind): number {
  if (plan === "pro") return Infinity;
  rollover();
  return Math.max(0, FREE_AI_QUOTA - usage[kind]);
}

export function useAIRemaining(kind: AIKind): number {
  const snap = () => (plan === "pro" ? Infinity : Math.max(0, FREE_AI_QUOTA - usage[kind]));
  return useSyncExternalStore(sub, snap, snap);
}

/** Consume un uso de IA de ese tipo. Devuelve true si se permite; false si la
 *  cuota gratis de ese tipo está agotada. Pro siempre true sin contar. */
export function consumeAI(kind: AIKind): boolean {
  if (plan === "pro") return true;
  rollover();
  if (usage[kind] >= FREE_AI_QUOTA) return false;
  usage = { ...usage, [kind]: usage[kind] + 1 };
  saveUsage();
  emit();
  return true;
}
