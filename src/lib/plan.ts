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
type Usage = { month: string; count: number };

let plan: Plan = "free";
let planReady = false;
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
      .select("plan, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    const active =
      !!data &&
      data.plan === "pro" &&
      (!data.expires_at || new Date(data.expires_at) > new Date());
    plan = active ? "pro" : "free";
  } catch {
    // Table missing (migration not applied yet) or offline → default to free.
    plan = "free";
  }
  planReady = true;
  emit();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    loadEntitlement(session.user.id);
  } else {
    plan = "free";
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

export type RedeemResult = { ok: boolean; error?: string };

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
      const u = JSON.parse(raw) as Usage;
      if (u && u.month === thisMonth()) return u;
    }
  } catch {}
  return { month: thisMonth(), count: 0 };
}

function saveUsage() {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {}
}

function rollover() {
  if (usage.month !== thisMonth()) {
    usage = { month: thisMonth(), count: 0 };
    saveUsage();
  }
}

export function aiRemaining(): number {
  if (plan === "pro") return Infinity;
  rollover();
  return Math.max(0, FREE_AI_QUOTA - usage.count);
}

export function useAIRemaining(): number {
  const snap = () => (plan === "pro" ? Infinity : Math.max(0, FREE_AI_QUOTA - usage.count));
  return useSyncExternalStore(sub, snap, snap);
}

/** Consume one AI use. Returns true if allowed; false if the free quota is
 *  exhausted. Pro always returns true without counting. */
export function consumeAI(): boolean {
  if (plan === "pro") return true;
  rollover();
  if (usage.count >= FREE_AI_QUOTA) return false;
  usage = { month: usage.month, count: usage.count + 1 };
  saveUsage();
  emit();
  return true;
}
