// "Tu red": usuarios registrados con los que ya compartes algún grupo. Se usan
// para añadir miembros al crear un grupo (solo usuarios reales, no texto libre).
import { supabase } from "./supabase";

export type Contact = { userId: string; name: string; avatar: string; email: string };

export async function getNetwork(): Promise<Contact[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Grupos en los que estoy.
    const { data: mine } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);
    const groupIds = (mine ?? []).map((m) => m.group_id);
    if (!groupIds.length) return [];

    // Metadatos de esos grupos: para ordenar por actividad reciente y excluir
    // los archivados / en papelera (solo sugerimos grupos activos).
    const { data: groupsMeta } = await supabase
      .from("groups")
      .select("id, updated_at, data")
      .in("id", groupIds);
    const recencyByGroup = new Map<string, number>();
    const activeGroupIds: string[] = [];
    for (const g of groupsMeta ?? []) {
      const d = (g.data ?? {}) as { archived?: boolean; deletedAt?: string };
      if (d.archived || d.deletedAt) continue;
      activeGroupIds.push(g.id);
      recencyByGroup.set(g.id, g.updated_at ? new Date(g.updated_at).getTime() : 0);
    }
    if (!activeGroupIds.length) return [];

    // Otros usuarios en esos grupos (con group_id para puntuar por recencia).
    const { data: others } = await supabase
      .from("group_members")
      .select("user_id, group_id")
      .in("group_id", activeGroupIds)
      .neq("user_id", user.id);
    // Para cada usuario, su recencia = el grupo activo compartido más reciente.
    const recencyByUser = new Map<string, number>();
    for (const o of others ?? []) {
      const ts = recencyByGroup.get(o.group_id) ?? 0;
      if (ts > (recencyByUser.get(o.user_id) ?? -1)) recencyByUser.set(o.user_id, ts);
    }
    const ids = [...recencyByUser.keys()];
    if (!ids.length) return [];

    const { data: profs, error } = await supabase
      .from("profiles")
      .select("id, name, avatar, email")
      .in("id", ids);
    const rows: { id: string; name?: string; avatar?: string; email?: string }[] = error
      ? ((await supabase.from("profiles").select("id, name").in("id", ids)).data ?? [])
      : (profs ?? []);
    const contacts: Contact[] = rows.map((p) => ({
      userId: p.id,
      name: p.name || "Usuario",
      avatar: p.avatar || "",
      email: p.email || "",
    }));
    // Ordena por grupo activo compartido más reciente (desc) → los de arriba son
    // sugerencias directas para hacer click.
    contacts.sort((a, b) => (recencyByUser.get(b.userId) ?? 0) - (recencyByUser.get(a.userId) ?? 0));
    return contacts;
  } catch {
    return [];
  }
}
