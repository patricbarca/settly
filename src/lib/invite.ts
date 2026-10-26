import { supabase } from "./supabase";
import type { Group } from "./types";
import { isNativePlatform } from "./plan";

/** Origen web canónico para los links de invitación. En la app nativa
 *  `window.location.origin` es `capacitor://localhost` (no compartible), así que
 *  siempre usamos la URL web real para que el enlace lo pueda abrir cualquiera. */
export const WEB_ORIGIN = "https://app.settlia.app";

/** URL base compartible (web real incluso en la app nativa). */
export function shareBaseUrl(): string {
  const origin = isNativePlatform() ? WEB_ORIGIN : window.location.origin;
  return (origin + import.meta.env.BASE_URL).replace(/\/$/, "");
}

export async function createInviteLink(group: Group, claimMemberId?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para compartir un grupo.");

  // Asegura que el grupo y la pertenencia del creador existen en Supabase antes
  // de crear el link. Repara grupos creados sin sesión / offline y evita la
  // carrera con addGroup (cuyos inserts no se esperan). Idempotente.
  await supabase
    .from("groups")
    .upsert({ id: group.id, owner_id: user.id, data: group }, { onConflict: "id", ignoreDuplicates: true });
  await supabase
    .from("group_members")
    .upsert(
      { group_id: group.id, user_id: user.id, member_id: group.meId },
      { onConflict: "group_id,user_id", ignoreDuplicates: true }
    );

  const { data, error } = await supabase
    .from("invite_links")
    .insert({ group_id: group.id, created_by: user.id, claim_member_id: claimMemberId ?? null })
    .select("token")
    .single();
  if (error || !data) throw error ?? new Error("No se pudo crear el link");
  return `${shareBaseUrl()}/?join=${data.token}`;
}

/**
 * Antes de unir la cuenta al grupo, muestra al invitado quién falta por
 * reclamar (miembros añadidos manualmente, sin cuenta todavía) para que pueda
 * elegir "soy yo". `null` si el token no es válido/expiró. Va por RPC: los
 * links ya no se pueden leer directamente (sin el token no se ve nada).
 */
export async function getJoinPreview(
  token: string
): Promise<{ groupName: string; unclaimed: { id: string; name: string }[] } | null> {
  const { data, error } = await supabase.rpc("preview_invite", { p_token: token });
  if (error || !data) return null;
  const d = data as { group_name: string; unclaimed: { id: string; name: string }[] };
  return { groupName: d.group_name, unclaimed: d.unclaimed ?? [] };
}

export type JoinResult =
  | { status: "joined"; group: Group }
  | { status: "pending"; groupId: string; groupName: string; ownerId: string }
  | null;

/** Abre un link de invitación (`join_by_token`, exige el token). Si ya eres
 *  miembro o eres el dueño, entras; si no, queda una solicitud pendiente que el
 *  dueño del grupo tiene que aceptar. */
export async function joinByToken(token: string, _userId: string, claimMemberId?: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc("join_by_token", {
    p_token: token,
    p_claim_member_id: claimMemberId ?? null,
  });
  if (error || !data) return null;
  const d = data as { pending?: boolean; group_id: string; member_id?: string; group_name?: string; owner_id?: string };
  if (d.pending) {
    return { status: "pending", groupId: d.group_id, groupName: d.group_name ?? "", ownerId: d.owner_id ?? "" };
  }
  const { data: row } = await supabase.from("groups").select("id, data").eq("id", d.group_id).single();
  if (!row) return null;
  return { status: "joined", group: { ...(row.data as Group), id: row.id, meId: d.member_id ?? "" } };
}

export type JoinRequest = { id: string; user_id: string; name: string | null; avatar: string | null; created_at: string };

export async function listJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const { data } = await supabase
    .from("join_requests")
    .select("id, user_id, name, avatar, created_at")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at");
  return (data as JoinRequest[] | null) ?? [];
}

export async function approveJoinRequest(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("approve_join_request", { p_id: id });
  return !error;
}

export async function rejectJoinRequest(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("reject_join_request", { p_id: id });
  return !error;
}
