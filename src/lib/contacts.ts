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

    // Otros usuarios en esos grupos.
    const { data: others } = await supabase
      .from("group_members")
      .select("user_id")
      .in("group_id", groupIds)
      .neq("user_id", user.id);
    const ids = [...new Set((others ?? []).map((o) => o.user_id))];
    if (!ids.length) return [];

    const { data: profs, error } = await supabase
      .from("profiles")
      .select("id, name, avatar, email")
      .in("id", ids);
    if (error) {
      // Columna avatar/email aún no creada: reintenta solo con lo básico.
      const { data: p2 } = await supabase.from("profiles").select("id, name").in("id", ids);
      return (p2 ?? []).map((p) => ({ userId: p.id, name: p.name || "Usuario", avatar: "", email: "" }));
    }
    return (profs ?? []).map((p) => ({
      userId: p.id,
      name: p.name || "Usuario",
      avatar: p.avatar || "",
      email: p.email || "",
    }));
  } catch {
    return [];
  }
}
