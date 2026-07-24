import { supabase } from "./supabase";
import type { Group } from "./types";
import { uid } from "./format";
import { withActivity } from "./activity";
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
 * elegir "soy yo" en vez de que el creador tenga que mandar un link por
 * persona. `null` si el token no es válido/expiró.
 */
export async function getJoinPreview(
  token: string
): Promise<{ groupName: string; unclaimed: { id: string; name: string }[] } | null> {
  const { data: invite } = await supabase
    .from("invite_links")
    .select("group_id, expires_at")
    .eq("token", token)
    .single();
  if (!invite || new Date(invite.expires_at) < new Date()) return null;

  const { data: row } = await supabase
    .from("groups").select("data").eq("id", invite.group_id).single();
  if (!row) return null;

  const group = row.data as Group;
  return {
    groupName: group.name,
    unclaimed: group.members.filter((m) => m.claimed === false).map((m) => ({ id: m.id, name: m.name })),
  };
}

export async function joinByToken(token: string, userId: string, claimMemberId?: string): Promise<Group | null> {
  const { data: invite } = await supabase
    .from("invite_links")
    .select("group_id, expires_at, claim_member_id")
    .eq("token", token)
    .single();

  if (!invite || new Date(invite.expires_at) < new Date()) return null;

  const { data: existing } = await supabase
    .from("group_members")
    .select("member_id")
    .eq("group_id", invite.group_id)
    .eq("user_id", userId)
    .single();

  if (existing) {
    const { data: row } = await supabase
      .from("groups").select("id, data").eq("id", invite.group_id).single();
    if (!row) return null;
    return { ...(row.data as Group), id: row.id, meId: existing.member_id };
  }

  const { data: profile } = await supabase
    .from("profiles").select("name, avatar").eq("id", userId).single();

  const { data: row } = await supabase
    .from("groups").select("id, data").eq("id", invite.group_id).single();
  if (!row) return null;
  const group = row.data as Group;

  // Si el invitado eligió "soy yo" sobre un miembro añadido manualmente (sin
  // cuenta) — vía el picker en el link general, o un link antiguo dirigido a
  // un miembro concreto — esta cuenta se vincula a ESE miembro en vez de crear
  // uno nuevo, así el gasto histórico ya asignado a esa persona no se pierde.
  const wantedId = claimMemberId ?? invite.claim_member_id;
  const claimTarget = wantedId
    ? group.members.find((m) => m.id === wantedId && m.claimed === false)
    : null;

  if (claimTarget) {
    const { data: alreadyClaimed } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", invite.group_id)
      .eq("member_id", claimTarget.id)
      .maybeSingle();

    if (!alreadyClaimed) {
      await supabase.from("group_members").insert({
        group_id: invite.group_id,
        user_id: userId,
        member_id: claimTarget.id,
      });

      const updated: Group = {
        ...group,
        members: group.members.map((m) =>
          m.id === claimTarget.id ? { ...m, avatar: m.avatar || profile?.avatar || "", claimed: true } : m
        ),
        activity: withActivity(group, {
          type: "member_joined",
          actorId: claimTarget.id,
          actorName: claimTarget.name,
        }),
      };

      await supabase.from("groups")
        .update({ data: updated, updated_at: new Date().toISOString() })
        .eq("id", invite.group_id);

      return { ...updated, meId: claimTarget.id };
    }
  }

  const newMemberId = uid();

  await supabase.from("group_members").insert({
    group_id: invite.group_id,
    user_id: userId,
    member_id: newMemberId,
  });

  const newMember = { id: newMemberId, name: profile?.name || "Nuevo miembro", avatar: "" };
  const updated: Group = {
    ...group,
    members: [...group.members, newMember],
    activity: withActivity(group, {
      type: "member_joined",
      actorId: newMemberId,
      actorName: newMember.name,
    }),
  };

  await supabase.from("groups")
    .update({ data: updated, updated_at: new Date().toISOString() })
    .eq("id", invite.group_id);

  return { ...updated, meId: newMemberId };
}
