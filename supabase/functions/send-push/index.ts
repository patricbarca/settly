// ============================================================
// Settly – Edge Function: send-push (Web Push, Fase 2)
// Envía una notificación push a los demás miembros de un grupo (excluye al
// emisor, identificado por su JWT). Resuelve destinatarios y suscripciones con
// la service-role key, así que NO depende de RLS para leer suscripciones ajenas.
//
// Despliegue:
//   supabase functions deploy send-push
//   supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...
//   (opcional) VAPID_SUBJECT=mailto:tu@correo
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles por defecto.
//
// Requiere la tabla push_subscriptions (ver supabase/push_subscriptions.sql).
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@settlia.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!VAPID_PRIVATE || !SERVICE_ROLE) return json({ error: "not_configured" }, 503);

    const { groupId, title, body, url } = await req.json();
    if (!groupId) return json({ error: "no_group" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Emisor (desde el JWT) para no notificarse a sí mismo.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    const callerId = user?.id ?? null;

    // Destinatarios: demás miembros del grupo.
    const { data: members } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    const userIds = [
      ...new Set((members ?? []).map((m) => m.user_id).filter((id) => id && id !== callerId)),
    ];
    if (!userIds.length) return json({ sent: 0 });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, subscription")
      .in("user_id", userIds);

    const payload = JSON.stringify({
      title: title || "SettliA",
      body: body || "",
      url: url || "/",
    });

    let sent = 0;
    await Promise.all(
      (subs ?? []).map(async (s: { endpoint: string; subscription: unknown }) => {
        try {
          await webpush.sendNotification(s.subscription, payload);
          sent++;
        } catch (e: unknown) {
          const code = (e as { statusCode?: number })?.statusCode;
          // Suscripción caducada/eliminada → limpiar.
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      })
    );

    return json({ sent });
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
