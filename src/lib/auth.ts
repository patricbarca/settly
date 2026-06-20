import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { uid } from "./format";

export type User = {
  id: string;
  name: string;
  email?: string;
  avatar: string;
  provider: "email" | "google" | "guest";
};

export type AuthPhase =
  | "loading"
  | "unauthenticated"
  | "otp_sent"
  | "needs_name"
  | "authenticated"
  | "guest";

type State = { phase: AuthPhase; user: User | null; otpEmail?: string };

let state: State = { phase: "loading", user: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function sub(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function fromSession(session: Session) {
  const au = session.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", au.id)
    .single();

  const name =
    profile?.name?.trim() ||
    au.user_metadata?.full_name?.trim() ||
    au.user_metadata?.name?.trim() ||
    "";

  if (!name) {
    state = { phase: "needs_name", user: null };
    emit();
    return;
  }

  if (!profile?.name) {
    await supabase.from("profiles").upsert({ id: au.id, name });
  }

  const user: User = {
    id: au.id,
    name,
    email: au.email,
    avatar: au.user_metadata?.avatar_url || "",
    provider: (au.app_metadata?.provider as User["provider"]) ?? "email",
  };

  state = { phase: "authenticated", user };
  emit();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    state = { phase: "unauthenticated", user: null };
    emit();
  } else {
    fromSession(session);
  }
});

export function useUser(): User | null {
  return useSyncExternalStore(sub, () => state.user, () => state.user);
}

export function useAuthPhase(): AuthPhase {
  return useSyncExternalStore(sub, () => state.phase, () => state.phase);
}

export function useOtpEmail(): string | undefined {
  return useSyncExternalStore(sub, () => state.otpEmail, () => state.otpEmail);
}

export async function signInEmail(name: string, email: string) {
  const e = email.trim();
  const n = name.trim();
  await supabase.auth.signInWithOtp({
    email: e,
    options: {
      shouldCreateUser: true,
      data: n ? { name: n } : undefined,
    },
  });
  state = { phase: "otp_sent", user: null, otpEmail: e };
  emit();
}

export async function verifyOtp(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export async function signInGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  });
}

export function signInGuest() {
  const user: User = { id: "guest_" + uid(), name: "Invitado", avatar: "", provider: "guest" };
  state = { phase: "guest", user };
  emit();
}

export async function setProfileName(name: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("profiles").upsert({ id: session.user.id, name: name.trim() });
  await fromSession(session);
}

export async function signOut() {
  if (state.phase === "guest") {
    state = { phase: "unauthenticated", user: null };
    emit();
    return;
  }
  await supabase.auth.signOut();
}
