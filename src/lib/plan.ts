// Client-side scaffolding for the freemium plan. This is the seam that the
// Supabase + Stripe backend will later fill: today the plan and the monthly AI
// usage live in localStorage so the whole Pro UX (paywall, gating, quota) is
// testable end-to-end before any payment is wired up.
import { useSyncExternalStore } from "react";

export type Plan = "free" | "pro";
export const FREE_AI_QUOTA = 3;

const PLAN_KEY = "settly.plan";
const USAGE_KEY = "settly.aiUsage";

type Usage = { month: string; count: number };

let plan: Plan = loadPlan();
let usage: Usage = loadUsage();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function sub(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function loadPlan(): Plan {
  try {
    return localStorage.getItem(PLAN_KEY) === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
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

export function isPro(): boolean {
  return plan === "pro";
}

export function usePlan(): Plan {
  return useSyncExternalStore(sub, () => plan, () => plan);
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

/** Consume one AI use. Returns true if allowed (and records it), false if the
 *  free quota is exhausted. Pro always returns true without counting. */
export function consumeAI(): boolean {
  if (plan === "pro") return true;
  rollover();
  if (usage.count >= FREE_AI_QUOTA) return false;
  usage = { month: usage.month, count: usage.count + 1 };
  saveUsage();
  emit();
  return true;
}

// TODO(backend): replace with Stripe Checkout (7-day trial, card required) and
// read the real status from the Supabase subscription. For now this flips the
// plan locally so the Pro experience can be demoed and tested.
export function activatePro() {
  plan = "pro";
  try {
    localStorage.setItem(PLAN_KEY, "pro");
  } catch {}
  emit();
}

// TODO(backend): open the Stripe Customer Portal. Local stub for testing.
export function deactivatePro() {
  plan = "free";
  try {
    localStorage.setItem(PLAN_KEY, "free");
  } catch {}
  emit();
}
