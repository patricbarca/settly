// ============================================================
// Settly – Edge Function: delete-account (RGPD / borrado de cuenta)
// Borra los datos del usuario autenticado (push, membresías, perfil) y elimina
// su cuenta de auth. Usa la service-role key (operación de administrador).
//
// Despliegue:
//   supabase functions deploy delete-account
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles por defecto.
//
// Nota: borra las membresías del usuario (lo saca de sus grupos). No borra los
// grupos compartidos para no afectar a los demás miembros.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS inline (sin import de ../_shared) para poder pegar este único archivo
// en el editor del dashboard de Supabase.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SERVICE_ROLE) return json({ error: "not_configured" }, 503);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const uid = user.id;

    // Antes de borrar la cuenta: transferir la propiedad de los grupos que
    // tengan otros miembros (owner_id es ON DELETE CASCADE; si no, se borrarían
    // para todos). Los grupos en solitario se eliminan en cascada.
    const { data: owned } = await admin.from("groups").select("id").eq("owner_id", uid);
    for (const g of owned ?? []) {
      const { data: others } = await admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", g.id)
        .neq("user_id", uid)
        .limit(1);
      const heir = others?.[0]?.user_id;
      if (heir) await admin.from("groups").update({ owner_id: heir }).eq("id", g.id);
    }

    // Borra datos asociados (lo que pueda existir; ignoramos errores por tabla).
    await admin.from("push_subscriptions").delete().eq("user_id", uid).catch(() => {});
    await admin.from("group_members").delete().eq("user_id", uid).catch(() => {});
    await admin.from("profiles").delete().eq("id", uid).catch(() => {});

    // Borra la cuenta de auth.
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) {
      console.error("deleteUser", error);
      return json({ error: "delete_failed" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
