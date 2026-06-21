import { supabase } from "./supabase";
import type { Group } from "./types";
import { uid } from "./format";

export async function createInviteLink(group: Group): Promise<string> {
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
    .insert({ group_id: group.id, created_by: user.id })
    .select("token")
    .single();
  if (error || !data) throw error ?? new Error("No se pudo crear el link");
  const base = window.location.origin + import.meta.env.BASE_URL;
  return `${base.replace(/\/$/, "")}/?join=${data.token}`;
}

export async function joinByToken(token: string, userId: string): Promise<Group | null> {
  const { data: invite } = await supabase
    .from("invite_links")
    .select("group_id, expires_at")
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
    .from("profiles").select("name").eq("id", userId).single();

  const newMemberId = uid();

  await supabase.from("group_members").insert({
    group_id: invite.group_id,
    user_id: userId,
    member_id: newMemberId,
  });

  const { data: row } = await supabase
    .from("groups").select("id, data").eq("id", invite.group_id).single();
  if (!row) return null;

  const group = row.data as Group;
  const newMember = { id: newMemberId, name: profile?.name || "Nuevo miembro", avatar: "" };
  const updated: Group = { ...group, members: [...group.members, newMember] };

  await supabase.from("groups")
    .update({ data: updated, updated_at: new Date().toISOString() })
    .eq("id", invite.group_id);

  return { ...updated, meId: newMemberId };
}
