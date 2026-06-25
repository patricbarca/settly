// ============================================================
// SettliA – Edge Function: test-push (utilidad de PRUEBA)
// Envía una notificación push a TODAS las suscripciones (broadcast), con el
// título/cuerpo que le pases. Protegida con CRON_SECRET. Pensada solo para
// probar Web Push; se puede borrar cuando ya no se necesite.
//
// Despliegue (dashboard, un solo archivo) + desactivar "Verify JWT".
// Llamar con: Authorization: Bearer <CRON_SECRET> y body
//   { "title": "SettliA", "body": "¡Hola! 🎉", "url": "/" }
// ============================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hola@settlia.app";
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!VAPID_PRIVATE || !SERVICE_ROLE) return json({ error: "not_configured" }, 503);
    const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "unauthorized" }, 401);

    let title = "SettliA", body = "Prueba de notificación 🎉", url = "/";
    try {
      const b = await req.json();
      if (b?.title) title = String(b.title);
      if (b?.body) body = String(b.body);
      if (b?.url) url = String(b.url);
    } catch { /* sin body */ }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: subs } = await admin.from("push_subscriptions").select("endpoint, subscription");

    const payload = JSON.stringify({ title, body, url });
    let sent = 0, removed = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try { await webpush.sendNotification(s.subscription, payload); sent++; }
      catch (e) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); removed++; }
      }
    }));

    return json({ sent, total: subs?.length ?? 0, removed });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
