import { supabase } from "./supabase";
import type { Group } from "./types";
import { uid } from "./format";
import { withActivity } from "./activity";

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
  const base = window.location.origin + import.meta.env.BASE_URL;
  return `${base.replace(/\/$/, "")}/?join=${data.token}`;
}

export async function joinByToken(token: string, userId: string): Promise<Group | null> {
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

  // Si el link apunta a un miembro añadido manualmente (sin cuenta) y nadie lo
  // ha reclamado todavía, esta cuenta se vincula a ESE miembro en vez de crear
  // uno nuevo — así el gasto histórico ya asignado a esa persona no se pierde.
  const claimTarget = invite.claim_member_id
    ? group.members.find((m) => m.id === invite.claim_member_id && m.claimed === false)
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
