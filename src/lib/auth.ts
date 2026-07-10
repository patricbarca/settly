import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";
import { uid } from "./format";
import { getLang } from "./i18n";
import type { PayMethod } from "./types";

// Deep link de retorno del login OAuth dentro de la app nativa (Capacitor).
// Debe coincidir con el CFBundleURLScheme en Info.plist y estar en la lista
// de Redirect URLs de Supabase (Authentication → URL Configuration).
const NATIVE_OAUTH_REDIRECT = "app.settlia.pwa://auth/callback";

if (Capacitor.isNativePlatform()) {
  CapApp.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(NATIVE_OAUTH_REDIRECT)) return;
    await Browser.close().catch(() => {});
    // supabase-js espera SOLO el código de autorización, no la URL completa
    // (lo manda tal cual como `auth_code` al servidor). El código puede venir
    // en la query (?code=) o, según config, en el fragmento (#code=).
    const code = /[?&#]code=([^&]+)/.exec(url)?.[1];
    if (!code) {
      // DIAGNÓSTICO TEMPORAL: mostrar en pantalla por qué no completa el login
      // (no hay consola visible en TestFlight). Se quita al identificar la causa.
      alert("Login · no llegó 'code' en la URL de retorno:\n" + url);
      return;
    }
    const { error } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(code));
    if (error) {
      alert("Login · error al canjear el código:\n" + error.message);
    }
  });
}

export type User = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar: string;
  /** Datos de perfil (fuente única en la tabla profiles). */
  country?: string;
  initials?: string;
  pays?: PayMethod[];
  provider: "email" | "google" | "apple" | "guest";
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

  // Intenta leer también los campos nuevos (country/initials/pays). Si las
  // columnas aún no existen (SQL no aplicado), recurre al select básico para no
  // romper el login en ese intervalo.
  let profile: any = null;
  {
    const full = await supabase
      .from("profiles")
      .select("name, phone, phone_verified, avatar, country, initials, pays")
      .eq("id", au.id)
      .single();
    if (full.error) {
      const basic = await supabase
        .from("profiles")
        .select("name, phone, phone_verified, avatar")
        .eq("id", au.id)
        .single();
      profile = basic.data;
    } else {
      profile = full.data;
    }
  }

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
    country: (profile?.country as string) || undefined,
    initials: (profile?.initials as string) || undefined,
    pays: Array.isArray(profile?.pays) ? (profile!.pays as PayMethod[]) : [],
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

/** Login por email+contraseña. Solo pensado para la cuenta demo de Apple
 *  Beta App Review (necesitan un usuario/contraseña fijos; el resto de la
 *  app usa OTP/OAuth, que no sirve para ese formulario). */
export async function signInPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Login OAuth: en la app nativa abre el navegador in-app y vuelve por el
 *  deep link (appUrlOpen la intercepta); en web es la redirección normal. */
async function oauthSignIn(provider: "google" | "apple", queryParams?: Record<string, string>) {
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true, queryParams },
    });
    if (error) throw error;
    if (data?.url) await Browser.open({ url: data.url });
    return;
  }
  await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
      queryParams,
    },
  });
}

export async function signInGoogle() {
  await oauthSignIn("google", { prompt: "select_account" });
}

export async function signInApple() {
  await oauthSignIn("apple");
}

export function signInGuest() {
  const user: User = { id: "guest_" + uid(), name: getLang() === "es" ? "Invitado" : "Guest", avatar: "", provider: "guest" };
  state = { phase: "guest", user };
  emit();
}

export async function setProfileName(name: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const n = name.trim();
  if (!n) return;
  const uid = session.user.id;

  // El perfil ya existe (lo crea el trigger handle_new_user o el primer login),
  // así que un UPDATE directo es lo más fiable (solo usa la política UPDATE).
  const { error: updErr } = await supabase
    .from("profiles")
    .update({ name: n })
    .eq("id", uid);
  if (updErr) {
    // Fallback por si la fila aún no existiera.
    const { error: upErr } = await supabase.from("profiles").upsert({ id: uid, name: n });
    if (upErr) console.error("[auth] no se pudo guardar el nombre:", upErr.message);
  }

  // Mantén el nombre también en los metadatos de Auth, como respaldo en caso de
  // que la lectura del perfil falle (fromSession recurre a user_metadata).
  await supabase.auth.updateUser({ data: { name: n, full_name: n } }).catch(() => {});

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

/** Guarda los datos de perfil (fuente única) en la tabla profiles. */
export async function setProfileExtra(patch: {
  country?: string;
  phone?: string;
  initials?: string;
  pays?: PayMethod[];
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const row: Record<string, unknown> = {};
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.initials !== undefined) row.initials = patch.initials;
  if (patch.pays !== undefined) row.pays = patch.pays;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("profiles").update(row).eq("id", session.user.id);
  if (error) console.error("[auth] setProfileExtra:", error.message);
  if (state.user) {
    state = { ...state, user: { ...state.user, ...patch } };
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
