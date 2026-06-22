import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { uid } from "./format";

export type User = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar: string;
  provider: "email" | "google" | "guest";
};

export type AuthPhase =
  | "loading"
  | "unauthenticated"
  | "otp_sent"
  | "needs_name"
  | "needs_phone"
  | "phone_otp_sent"
  | "authenticated"
  | "guest";

type State = { phase: AuthPhase; user: User | null; otpEmail?: string; pendingPhone?: string };

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
    .select("name, phone, phone_verified, avatar")
    .eq("id", au.id)
    .single();

  // Avatar: foto guardada en el perfil, o por defecto la de Google.
  const googleAvatar = au.user_metadata?.avatar_url || "";
  const avatar = profile?.avatar?.trim() || googleAvatar;
  // Si no hay avatar guardado pero Google trae uno, persístelo (para que el
  // resto de miembros también lo vean). Fire-and-forget.
  if (!profile?.avatar && googleAvatar) {
    supabase.from("profiles").update({ avatar: googleAvatar }).eq("id", au.id).then(() => {});
  }

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
    // also sync email if column exists (after migrate_v2.sql is applied)
    await supabase.from("profiles").upsert({ id: au.id, name, email: au.email || "" })
      .then(() => {})
      .catch(() => supabase.from("profiles").upsert({ id: au.id, name }));
  }

  const partialUser: User = {
    id: au.id,
    name,
    email: au.email,
    phone: profile?.phone || undefined,
    avatar,
    provider: (au.app_metadata?.provider as User["provider"]) ?? "email",
  };

  // Teléfono opcional durante la beta: sin proveedor SMS configurado en
  // Supabase, exigir verificación por SMS bloquearía el login. Se puede volver
  // a activar (fase needs_phone + PhoneScreen) cuando haya proveedor SMS.
  state = { phase: "authenticated", user: partialUser };
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

export function usePendingPhone(): string | undefined {
  return useSyncExternalStore(sub, () => state.pendingPhone, () => state.pendingPhone);
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

export async function setProfileAvatar(dataUrl: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("profiles").update({ avatar: dataUrl }).eq("id", session.user.id);
  if (state.user) {
    state = { ...state, user: { ...state.user, avatar: dataUrl } };
    emit();
  }
}

export async function submitPhone(phone: string) {
  const { error } = await supabase.auth.updateUser({ phone: phone.trim() });
  if (error) throw error;
  state = { ...state, phase: "phone_otp_sent", pendingPhone: phone.trim() };
  emit();
}

export async function verifyPhone(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
  if (error) throw error;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await supabase.from("profiles").update({ phone: phone.trim(), phone_verified: true }).eq("id", session.user.id);
    sessionStorage.removeItem("settly.phoneSkipped");
    await fromSession(session);
  }
}

export async function skipPhone() {
  sessionStorage.setItem("settly.phoneSkipped", "1");
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await fromSession(session);
}

export async function signOut() {
  if (state.phase === "guest") {
    state = { phase: "unauthenticated", user: null };
    emit();
    return;
  }
  sessionStorage.removeItem("settly.phoneSkipped");
  await supabase.auth.signOut();
}

/** Elimina la cuenta y todos los datos del usuario (Edge Function
 *  delete-account, con service-role), y cierra sesión. */
export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke("delete-account");
  if (error) throw error;
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error?: string }).error);
  }
  await supabase.auth.signOut();
}
