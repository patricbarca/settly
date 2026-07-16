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
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS inline (sin import de ../_shared) para poder pegar este archivo en el
// editor del dashboard de Supabase.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@settlia.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// ---- Push NATIVO iOS (APNs) --------------------------------------------------
// Envía a los tokens de device_push_tokens (plataforma "ios") vía APNs HTTP/2,
// autenticando con un JWT ES256 firmado con la clave .p8 de Apple.
const APNS_KEY_P8 = Deno.env.get("APNS_KEY_P8") ?? "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "app.settlia.pwa";
// "production" para TestFlight y App Store; "sandbox" solo para builds de Xcode.
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production").trim();
const apnsConfigured = !!(APNS_KEY_P8 && APNS_KEY_ID && APNS_TEAM_ID);

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN[^-]+-----/, "").replace(/-----END[^-]+-----/, "").replace(/\s+/g, "");
  const raw = atob(b64);
  const der = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) der[i] = raw.charCodeAt(i);
  return der;
}
let apnsJwtCache: { token: string; iat: number } | null = null;
async function apnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwtCache && now - apnsJwtCache.iat < 3000) return apnsJwtCache.token; // < 50 min
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(APNS_KEY_P8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`)),
  );
  const token = `${header}.${payload}.${b64url(sig)}`;
  apnsJwtCache = { token, iat: now };
  return token;
}
async function sendApns(
  admin: ReturnType<typeof createClient>,
  tokens: string[],
  title: string,
  body: string,
  url: string,
): Promise<number> {
  if (!apnsConfigured || !tokens.length) return 0;
  const host = APNS_ENV === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const jwt = await apnsJwt();
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, url });
  let sent = 0;
  await Promise.all(tokens.map(async (tk) => {
    try {
      const res = await fetch(`https://${host}/3/device/${tk}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": APNS_BUNDLE_ID,
          "apns-push-type": "alert",
          "content-type": "application/json",
        },
        body: payload,
      });
      if (res.ok) sent++;
      else if (res.status === 410 || res.status === 400) {
        // Token inválido/expirado → limpiar.
        await admin.from("device_push_tokens").delete().eq("token", tk);
      }
    } catch (e) {
      console.error("[apns] send error", e);
    }
  }));
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SERVICE_ROLE || (!VAPID_PRIVATE && !apnsConfigured)) {
      return json({ error: "not_configured" }, 503);
    }

    const { groupId, title, body, url, toUserId } = await req.json();
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
    let userIds = [
      ...new Set((members ?? []).map((m) => m.user_id).filter((id) => id && id !== callerId)),
    ];
    // Recordatorio 1-a-1: si viene toUserId, notificar SOLO a esa persona
    // (siempre que sea miembro del grupo y no sea el propio emisor).
    if (toUserId) userIds = userIds.filter((id) => id === toUserId);
    if (!userIds.length) return json({ sent: 0 });

    // Push nativo (APNs) a los dispositivos iOS de esos usuarios.
    let apnsSent = 0;
    if (apnsConfigured) {
      const { data: devices } = await admin
        .from("device_push_tokens")
        .select("token")
        .eq("platform", "ios")
        .in("user_id", userIds);
      const tokens = [...new Set((devices ?? []).map((d) => d.token as string).filter(Boolean))];
      apnsSent = await sendApns(admin, tokens, title || "Settlia", body || "", url || "/");
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, subscription")
      .in("user_id", userIds);

    const payload = JSON.stringify({
      title: title || "Settlia",
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

    return json({ sent: sent + apnsSent, web: sent, apns: apnsSent });
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
