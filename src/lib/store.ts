import { useSyncExternalStore } from "react";
import type { Group, RecurringExpense, RecurrenceInterval, Expense, ActivityEvent, AppNotification } from "./types";
import { supabase } from "./supabase";
import { createSeed } from "./seed";
import { uid, money } from "./format";
import { withActivity, makeActivity } from "./activity";
import { makeNotif } from "./notifications";
import { notifyGroup } from "./push";
import { tr } from "./i18n";
import {
  idbPutGroup,
  idbGetAllGroups,
  idbDeleteGroup,
  idbAddToOutbox,
  idbGetOutbox,
  idbClearFromOutbox,
  idbClearAll,
} from "./db";

type State = { groups: Group[]; activeId: string | null; loading: boolean };

let state: State = { groups: [], activeId: null, loading: true };
let currentUserId: string | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

const listeners = new Set<() => void>();

// Vistas derivadas memoizadas (referencia estable para useSyncExternalStore):
// `activeGroups` = no borrados; `trashedGroups` = en la papelera y míos (dueño).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let activeGroups: Group[] = [];
let trashedGroups: Group[] = [];
function recompute() {
  activeGroups = state.groups.filter((g) => !g.deletedAt);
  trashedGroups = state.groups.filter(
    (g) => g.deletedAt && (g.ownerId === currentUserId || !g.ownerId)
  );
}

function emit() {
  recompute();
  listeners.forEach((l) => l());
}

function sub(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function loadFromIndexedDB() {
  try {
    const groups = await idbGetAllGroups();
    if (groups.length > 0) {
      state = { ...state, groups, loading: true };
      emit();
    }
  } catch {
    // IndexedDB unavailable (e.g. private browsing in Firefox)
  }
}

async function loadGroups(userId: string) {
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
    .select("id, data, created_at, owner_id")
    .in("id", ids)
    .order("created_at", { ascending: false });

  const groups: Group[] = [];
  const removedFrom: string[] = [];
  for (const r of rows ?? []) {
    const data = r.data as Group;
    const meId = meMap[r.id];
    // Si fui expulsado del grupo, ya no aparezco en members[] del JSON aunque
    // mi fila de group_members siga existiendo (la RLS no deja que el admin la
    // borre). Detectarlo aquí: ocultar el grupo, limpiar mi membresía y la caché.
    const stillMember = meId != null && (data.members ?? []).some((m) => m.id === meId);
    if (!stillMember) {
      removedFrom.push(r.id);
      continue;
    }
    const g: Group = { ...data, id: r.id, meId, ownerId: r.owner_id as string };
    // Papelera: si el dueño lo borró hace más de 7 días, se elimina para siempre.
    if (g.deletedAt && r.owner_id === userId && Date.now() - new Date(g.deletedAt).getTime() > WEEK_MS) {
      supabase.from("groups").delete().eq("id", r.id).then(() => {});
      idbDeleteGroup(r.id).catch(() => {});
      idbClearFromOutbox([r.id]).catch(() => {});
      continue;
    }
    groups.push(g);
  }

  for (const gid of removedFrom) {
    // "Leave group" RLS permite borrar la propia fila (user_id = auth.uid()).
    supabase.from("group_members").delete().eq("group_id", gid).eq("user_id", userId).then(() => {});
    idbDeleteGroup(gid).catch(() => {});
    idbClearFromOutbox([gid]).catch(() => {});
  }

  state = {
    groups,
    activeId: groups.some((g) => g.id === state.activeId) ? state.activeId : null,
    loading: false,
  };
  emit();

  for (const g of groups) idbPutGroup(g).catch(() => {});
}

async function syncOutbox() {
  if (!currentUserId || !isOnline) return;
  try {
    const pending = await idbGetOutbox();
    if (!pending.length) return;

    const synced: string[] = [];
    for (const groupId of pending) {
      const g = state.groups.find((g) => g.id === groupId);
      if (!g) { synced.push(groupId); continue; }
      const { error } = await supabase
        .from("groups")
        .update({ data: g, updated_at: new Date().toISOString() })
        .eq("id", g.id);
      if (!error) synced.push(groupId);
    }
    if (synced.length) await idbClearFromOutbox(synced);
  } catch {
    // Will retry on next reconnect
  }
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
  idbPutGroup(group).catch(() => {});
  if (!isOnline) {
    idbAddToOutbox(group.id).catch(() => {});
    return;
  }
  supabase
    .from("groups")
    .update({ data: group, updated_at: new Date().toISOString() })
    .eq("id", group.id)
    .then(({ error }) => {
      if (error) {
        console.error("persist:", error);
        idbAddToOutbox(group.id).catch(() => {});
      }
    });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    isOnline = true;
    emit();
    syncOutbox();
  });
  window.addEventListener("offline", () => {
    isOnline = false;
    emit();
  });
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    currentUserId = session.user.id;
    loadFromIndexedDB().then(() => {
      if (currentUserId) loadGroups(currentUserId);
    });
    subscribeRealtime(session.user.id);
  } else {
    currentUserId = null;
    channel?.unsubscribe();
    channel = null;
    state = { groups: [], activeId: null, loading: false };
    emit();
    idbClearAll().catch(() => {});
  }
});

export function useGroups(): Group[] {
  return useSyncExternalStore(sub, () => activeGroups, () => activeGroups);
}

/** TODOS los grupos (activos + papelera + archivados). Para leer datos del
 *  perfil del usuario sin perderlos cuando un grupo está en la papelera. */
export function useAllGroups(): Group[] {
  return useSyncExternalStore(sub, () => state.groups, () => state.groups);
}

/** Grupos en la papelera que puedo gestionar (soy el dueño). */
export function useTrashedGroups(): Group[] {
  return useSyncExternalStore(sub, () => trashedGroups, () => trashedGroups);
}

export function useActiveGroup(): Group | undefined {
  const find = () => {
    const g = state.groups.find((g) => g.id === state.activeId);
    return g && !g.deletedAt ? g : undefined;
  };
  return useSyncExternalStore(sub, find, find);
}

export function useGroupsLoading(): boolean {
  return useSyncExternalStore(sub, () => state.loading, () => state.loading);
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(sub, () => isOnline, () => true);
}

export function setActiveGroup(id: string | null) {
  state = { ...state, activeId: id };
  emit();
}

export async function addGroup(
  group: Group,
  extraMembers: { userId: string; memberId: string }[] = []
) {
  state = { groups: [group, ...state.groups], activeId: group.id };
  emit();
  if (!currentUserId) return;
  idbPutGroup(group).catch(() => {});
  const { error: gErr } = await supabase
    .from("groups")
    .insert({ id: group.id, owner_id: currentUserId, data: group });
  if (gErr) { console.error("addGroup:", gErr); return; }
  // Mi pertenencia primero (la RLS para añadir a otros la exige existente).
  const { error: meErr } = await supabase
    .from("group_members")
    .insert({ group_id: group.id, user_id: currentUserId, member_id: group.meId });
  if (meErr) console.error("addMember:", meErr);
  if (extraMembers.length) {
    const rows = extraMembers.map((m) => ({
      group_id: group.id,
      user_id: m.userId,
      member_id: m.memberId,
    }));
    const { error: exErr } = await supabase.from("group_members").insert(rows);
    if (exErr) console.error("addExtraMembers:", exErr);
  }
}

export function archiveGroup(id: string, value: boolean) {
  const groups = state.groups.map((g) =>
    g.id === id
      ? {
          ...g,
          archived: value,
          activity: withActivity(g, {
            type: value ? "group_archived" : "group_unarchived",
            actorId: g.meId,
            actorName: g.members.find((m) => m.id === g.meId)?.name,
          }),
        }
      : g
  );
  state = { ...state, groups, activeId: value && state.activeId === id ? null : state.activeId };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) persist(g);
}

/** Borrado lógico (solo el dueño): el grupo va a la papelera, recuperable 7
 *  días. Se sincroniza (deletedAt viaja en el JSON), así desaparece para todos. */
export function deleteGroup(id: string) {
  const now = new Date().toISOString();
  const groups = state.groups.map((g) => (g.id === id ? { ...g, deletedAt: now } : g));
  state = { ...state, groups, activeId: state.activeId === id ? null : state.activeId };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) persist(g);
}

/** Recupera un grupo de la papelera dentro del plazo (solo el dueño). */
export function recoverGroup(id: string) {
  const groups = state.groups.map((g) => {
    if (g.id !== id) return g;
    const { deletedAt: _omit, ...rest } = g;
    return rest as Group;
  });
  state = { ...state, groups };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) persist(g);
}

/** Elimina el grupo para SIEMPRE (solo el dueño). */
export function purgeGroup(id: string) {
  state = {
    ...state,
    groups: state.groups.filter((g) => g.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  };
  emit();
  idbDeleteGroup(id).catch(() => {});
  idbClearFromOutbox([id]).catch(() => {});
  if (!currentUserId) return;
  supabase.from("groups").delete().eq("id", id)
    .then(({ error }) => { if (error) console.error("purgeGroup:", error); });
}

/** Salir de un grupo (para quien NO es el dueño): elimina solo tu membresía,
 *  el grupo desaparece de tu lista y balances sin afectar a los demás.
 *  También te saca de `members[]` (antes solo se borraba la fila de
 *  group_members, dejando un miembro "fantasma" visible para siempre a los
 *  demás, sin forma de quitarlo si tenía gastos/pagos asociados). */
export function leaveGroup(id: string) {
  const userId = currentUserId;
  const g = state.groups.find((g) => g.id === id);
  state = {
    ...state,
    groups: state.groups.filter((g) => g.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  };
  emit();
  idbDeleteGroup(id).catch(() => {});
  idbClearFromOutbox([id]).catch(() => {});
  if (!userId) return;
  if (g) {
    const meName = g.members.find((m) => m.id === g.meId)?.name;
    const updated: Group = {
      ...g,
      members: g.members.filter((m) => m.id !== g.meId),
      activity: withActivity(g, { type: "member_left", actorId: g.meId, actorName: meName }),
    };
    // Se guarda mientras todavía soy miembro (RLS lo permite); recién después
    // se borra la fila de group_members.
    supabase.from("groups").update({ data: updated, updated_at: new Date().toISOString() }).eq("id", id)
      .then(({ error }) => {
        if (error) console.error("leaveGroup update:", error);
        supabase.from("group_members").delete().eq("group_id", id).eq("user_id", userId)
          .then(({ error }) => { if (error) console.error("leaveGroup:", error); });
      });
  } else {
    supabase.from("group_members").delete().eq("group_id", id).eq("user_id", userId)
      .then(({ error }) => { if (error) console.error("leaveGroup:", error); });
  }
}

export function updateGroup(id: string, fn: (g: Group) => Group) {
  const groups = state.groups.map((g) => (g.id === id ? fn(g) : g));
  state = { ...state, groups };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) persist(g);
}

// Igual que updateGroup, pero sin persistir: solo actualiza el estado local +
// caché IndexedDB. Lo usan las operaciones atómicas de gastos (más abajo) para
// reflejar el cambio al instante en la UI mientras el RPC atómico viaja al
// servidor por su cuenta — evita el doble-persist (uno optimista de blob
// completo + otro atómico) que reintroduciría el problema de sobrescritura.
function applyLocal(id: string, fn: (g: Group) => Group): Group | undefined {
  const groups = state.groups.map((g) => (g.id === id ? fn(g) : g));
  state = { ...state, groups };
  emit();
  const g = groups.find((g) => g.id === id);
  if (g) idbPutGroup(g).catch(() => {});
  return g;
}

type NotifRemovePredicate = { type: string; expenseId: string };

function applyNotifRemove(notifications: AppNotification[], pred?: NotifRemovePredicate): AppNotification[] {
  if (!pred) return notifications;
  return notifications.filter((n) => !(n.type === pred.type && n.expenseId === pred.expenseId));
}

/**
 * Operaciones atómicas sobre gastos (Fase 1 del arreglo de concurrencia).
 *
 * A diferencia de `updateGroup` (que sobrescribe TODO group.data desde la
 * copia local, pudiendo pisar cambios de otro dispositivo hechos mientras
 * tanto), estas funciones llaman a RPCs de Postgres (`add_expense`,
 * `patch_expense`, `delete_expense`, ver migrate_v10_atomic_expense_ops.sql)
 * que parchean SOLO el gasto afectado dentro del JSONB, con un lock de fila
 * (`SELECT ... FOR UPDATE`) que serializa escrituras concurrentes en vez de
 * dejarlas competir en el cliente. Dos personas editando gastos distintos —o
 * incluso campos distintos del MISMO gasto— a la vez ya no se pisan.
 *
 * Aplican el cambio localmente al instante (optimista, vía `applyLocal`) y
 * disparan el RPC en paralelo; si el RPC falla se reintenta vía el outbox
 * (mismo mecanismo que `persist`).
 *
 * Sin conexión no hay RPC posible: cae al `updateGroup` de siempre (blob
 * completo + outbox), igual que antes de este cambio — la ventana de
 * colisión solo se cierra del todo estando online, que es el caso común.
 */
export async function addExpense(
  groupId: string,
  expense: Expense,
  opts?: { activity?: ActivityEvent; notifAdd?: AppNotification }
) {
  const apply = (g: Group): Group => ({
    ...g,
    expenses: [expense, ...g.expenses],
    activity: opts?.activity ? [...(g.activity ?? []), opts.activity].slice(-200) : g.activity,
    notifications: opts?.notifAdd ? [...(g.notifications ?? []), opts.notifAdd].slice(-100) : g.notifications,
  });

  if (!isOnline || !currentUserId) {
    updateGroup(groupId, apply);
    return;
  }
  applyLocal(groupId, apply);
  const { error } = await supabase.rpc("add_expense", {
    p_group_id: groupId,
    p_expense: expense,
    p_activity: opts?.activity ?? null,
    p_notif_add: opts?.notifAdd ?? null,
  });
  if (error) {
    console.error("add_expense:", error);
    idbAddToOutbox(groupId).catch(() => {});
  }
}

export async function patchExpense(
  groupId: string,
  expenseId: string,
  patch: Partial<Expense>,
  opts?: { activity?: ActivityEvent; notifAdd?: AppNotification; notifRemove?: NotifRemovePredicate }
) {
  const apply = (g: Group): Group => ({
    ...g,
    expenses: g.expenses.map((e) => (e.id === expenseId ? { ...e, ...patch } : e)),
    activity: opts?.activity ? [...(g.activity ?? []), opts.activity].slice(-200) : g.activity,
    notifications: (() => {
      let n = applyNotifRemove(g.notifications ?? [], opts?.notifRemove);
      if (opts?.notifAdd) n = [...n, opts.notifAdd].slice(-100);
      return n;
    })(),
  });

  if (!isOnline || !currentUserId) {
    updateGroup(groupId, apply);
    return;
  }
  applyLocal(groupId, apply);
  const { error } = await supabase.rpc("patch_expense", {
    p_group_id: groupId,
    p_expense_id: expenseId,
    p_patch: patch,
    p_activity: opts?.activity ?? null,
    p_notif_add: opts?.notifAdd ?? null,
    p_notif_remove_type: opts?.notifRemove?.type ?? null,
    p_notif_remove_expense_id: opts?.notifRemove?.expenseId ?? null,
  });
  if (error) {
    console.error("patch_expense:", error);
    idbAddToOutbox(groupId).catch(() => {});
  }
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  opts?: { activity?: ActivityEvent; notifRemove?: NotifRemovePredicate }
) {
  const apply = (g: Group): Group => ({
    ...g,
    expenses: g.expenses.filter((e) => e.id !== expenseId),
    activity: opts?.activity ? [...(g.activity ?? []), opts.activity].slice(-200) : g.activity,
    notifications: applyNotifRemove(g.notifications ?? [], opts?.notifRemove),
  });

  if (!isOnline || !currentUserId) {
    updateGroup(groupId, apply);
    return;
  }
  applyLocal(groupId, apply);
  const { error } = await supabase.rpc("delete_expense", {
    p_group_id: groupId,
    p_expense_id: expenseId,
    p_activity: opts?.activity ?? null,
    p_notif_remove_type: opts?.notifRemove?.type ?? null,
    p_notif_remove_expense_id: opts?.notifRemove?.expenseId ?? null,
  });
  if (error) {
    console.error("delete_expense:", error);
    idbAddToOutbox(groupId).catch(() => {});
  }
}

export function addRecurring(groupId: string, r: RecurringExpense) {
  updateGroup(groupId, (g) => ({
    ...g,
    recurring: [...(g.recurring ?? []), r],
    activity: withActivity(g, {
      type: "recurring_added",
      actorId: g.meId,
      actorName: g.members.find((m) => m.id === g.meId)?.name,
      label: r.label,
      amount: r.amount,
    }),
  }));
}

export function updateRecurring(groupId: string, id: string, patch: Partial<RecurringExpense>) {
  updateGroup(groupId, (g) => ({
    ...g,
    recurring: (g.recurring ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
  }));
}

export function deleteRecurring(groupId: string, id: string) {
  updateGroup(groupId, (g) => {
    const r = (g.recurring ?? []).find((x) => x.id === id);
    return {
      ...g,
      recurring: (g.recurring ?? []).filter((x) => x.id !== id),
      activity: withActivity(g, {
        type: "recurring_deleted",
        actorId: g.meId,
        actorName: g.members.find((m) => m.id === g.meId)?.name,
        label: r?.label,
        amount: r?.amount,
      }),
    };
  });
}

function advanceDate(date: string, interval: RecurrenceInterval): string {
  const d = new Date(date + "T00:00:00");
  if (interval === "daily")   d.setDate(d.getDate() + 1);
  if (interval === "weekly")  d.setDate(d.getDate() + 7);
  if (interval === "monthly") d.setMonth(d.getMonth() + 1);
  if (interval === "yearly")  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function processRecurring(groupId: string) {
  const today = new Date().toISOString().slice(0, 10);
  // Reglas que generaron ≥1 gasto en esta pasada → push tras persistir (a los
  // demás miembros; quien dispara la generación está en la app y ya ve la
  // notificación in-app, así que no necesita push).
  const pushed: { label: string; amount: number; payerName: string; currency: string }[] = [];
  updateGroup(groupId, (g) => {
    if (!g.recurring?.some((r) => r.active && r.nextDate <= today)) return g;
    let newExpenses = [...g.expenses];
    let notifications = g.notifications ?? [];
    let activity = g.activity ?? [];
    const updatedRecurring = g.recurring.map((r) => {
      if (!r.active || r.nextDate > today) return r;
      let nextDate = r.nextDate;
      let count = 0;
      while (nextDate <= today && count < 12) {
        newExpenses.unshift({
          id: uid(),
          label: r.label,
          amount: r.amount,
          payerId: r.payerId,
          ...(r.payments?.length ? { payments: r.payments } : {}),
          participantIds: r.participantIds,
          splits: r.splits ?? null,
          category: r.category,
          date: nextDate,
        });
        nextDate = advanceDate(nextDate, r.interval);
        count++;
      }
      if (count > 0) {
        // Una sola entrada por regla aunque haya varios ciclos de recuperación.
        // Sin actorId → la ven TODOS (pagador + participantes), incluido quien
        // disparó la generación (buildFeed solo oculta las de actorId === yo).
        const payerName = g.members.find((m) => m.id === r.payerId)?.name ?? "?";
        notifications = [
          ...notifications,
          makeNotif({ type: "recurring_generated", label: r.label, amount: r.amount, toId: r.payerId, toName: payerName }),
        ].slice(-100);
        activity = [
          ...activity,
          makeActivity({ type: "recurring_generated", label: r.label, amount: r.amount, toId: r.payerId, toName: payerName }),
        ].slice(-200);
        pushed.push({ label: r.label, amount: r.amount, payerName, currency: g.currency });
      }
      return { ...r, nextDate };
    });
    return { ...g, expenses: newExpenses, recurring: updatedRecurring, notifications, activity };
  });
  const groupName = state.groups.find((g) => g.id === groupId)?.name ?? "Settlia";
  for (const p of pushed) {
    notifyGroup(
      groupId,
      groupName,
      tr("notif.recurring_generated", { label: p.label, amt: money(p.amount, p.currency), payer: p.payerName })
    );
  }
}

export function updateMyMember(patch: Partial<import("./types").Member>) {
  const groupIds = state.groups
    .filter((g) => g.members.some((m) => m.id === g.meId))
    .map((g) => g.id);
  for (const id of groupIds) {
    updateGroup(id, (g) => ({
      ...g,
      members: g.members.map((m) => (m.id === g.meId ? { ...m, ...patch } : m)),
    }));
  }
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
