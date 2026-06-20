import { useSyncExternalStore } from "react";
import type { Group } from "./types";
import { supabase } from "./supabase";
import { createSeed } from "./seed";

type State = { groups: Group[]; activeId: string | null; loading: boolean };

let state: State = { groups: [], activeId: null, loading: true };
let currentUserId: string | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function sub(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function loadGroups(userId: string) {
  state = { ...state, loading: true };
  emit();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, member_id")
    .eq("user_id", userId);

  if (!memberships?.length) {
    state = { groups: [], activeId: null, loading: false };
    emit();
    return;
  }

  const ids = memberships.map((m) => m.group_id);
  const meMap = Object.fromEntries(memberships.map((m) => [m.group_id, m.member_id]));

  const { data: rows } = await supabase
    .from("groups")
    .select("id, data, created_at")
    .in("id", ids)
    .order("created_at", { ascending: false });

  const groups: Group[] = (rows ?? []).map((r) => ({
    ...(r.data as Group),
    id: r.id,
    meId: meMap[r.id],
  }));

  state = { groups, activeId: null, loading: false };
  emit();
}

function subscribeRealtime(userId: string) {
  channel?.unsubscribe();
  channel = supabase
    .channel(`groups:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
      if (currentUserId) loadGroups(currentUserId);
    })
    .subscribe();
}

function persist(group: Group) {
  if (!currentUserId) return;
  supabase
    .from("groups")
    .update({ data: group, updated_at: new Date().toISOString() })
    .eq("id", group.id)
    .then(({ error }) => { if (error) console.error("persist:", error); });
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    currentUserId = session.user.id;
    loadGroups(session.user.id);
    subscribeRealtime(session.user.id);
  } else {
    currentUserId = null;
    channel?.unsubscribe();
    channel = null;
    state = { groups: [], activeId: null, loading: false };
    emit();
  }
});

export function useGroups(): Group[] {
  return useSyncExternalStore(sub, () => state.groups, () => state.groups);
}

export function useActiveGroup(): Group | undefined {
  return useSyncExternalStore(
    sub,
    () => state.groups.find((g) => g.id === state.activeId),
    () => state.groups.find((g) => g.id === state.activeId)
  );
}

export function useGroupsLoading(): boolean {
  return useSyncExternalStore(sub, () => state.loading, () => state.loading);
}

export function setActiveGroup(id: string | null) {
  state = { ...state, activeId: id };
  emit();
}

export function addGroup(group: Group) {
  state = { groups: [group, ...state.groups], activeId: group.id };
  emit();
  if (!currentUserId) return;
  supabase.from("groups")
    .insert({ id: group.id, owner_id: currentUserId, data: group })
    .then(({ error }) => { if (error) console.error("addGroup:", error); });
  supabase.from("group_members")
    .insert({ group_id: group.id, user_id: currentUserId, member_id: group.meId })
    .then(({ error }) => { if (error) console.error("addMember:", error); });
}

export function archiveGroup(id: string, value: boolean) {
  const groups = state.groups.map((g) => (g.id === id ? { ...g, archived: value } : g));
  state = { ...state, groups, activeId: value && state.activeId === id ? null : state.activeId };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) persist(g);
}

export function deleteGroup(id: string) {
  state = {
    ...state,
    groups: state.groups.filter((g) => g.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  };
  emit();
  if (!currentUserId) return;
  supabase.from("groups").delete().eq("id", id)
    .then(({ error }) => { if (error) console.error("deleteGroup:", error); });
}

export function updateGroup(id: string, fn: (g: Group) => Group) {
  const groups = state.groups.map((g) => (g.id === id ? fn(g) : g));
  state = { ...state, groups };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) persist(g);
}

export function loadGuestMode() {
  state = { groups: [createSeed()], activeId: null, loading: false };
  emit();
}

export function resetSeed() {
  if (currentUserId) return;
  state = { groups: [createSeed()], activeId: null, loading: false };
  emit();
}
