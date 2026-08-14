// ============================================================
// Settly – Edge Function: send-push (Web Push + APNs nativo)
// Envía una notificación push a los demás miembros de un grupo (excluye al
// emisor, identificado por su JWT). Resuelve destinatarios y suscripciones con
// la service-role key, así que NO depende de RLS para leer suscripciones ajenas.
//
// Despliegue:
//   supabase functions deploy send-push
//   Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ opcional VAPID_SUBJECT)
//   APNs:    APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID (+ opcional APNS_BUNDLE_ID, APNS_ENV)
//
// NOTA (bug histórico): el builder de supabase-js v2 es "thenable" pero NO
// expone `.catch(...)` — usar `.insert(x).catch(()=>{})` lanza un TypeError y
// tumba toda la función con 500. Para logs de diagnóstico usar el helper `dbg`
// (await + try/catch), nunca `.catch` sobre el builder.
// ============================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); } catch (_) { /* ignore */ }
}

// .trim() defensivo: un espacio o \n pegado al copiar el secreto (típico en el
// Team ID / Key ID) corrompe el JWT → APNs responde 403 InvalidProviderToken.
const APNS_KEY_P8 = (Deno.env.get("APNS_KEY_P8") ?? "").trim();
const APNS_KEY_ID = (Deno.env.get("APNS_KEY_ID") ?? "").trim();
const APNS_TEAM_ID = (Deno.env.get("APNS_TEAM_ID") ?? "").trim();
const APNS_BUNDLE_ID = (Deno.env.get("APNS_BUNDLE_ID") ?? "app.settlia.pwa").trim();
// "production" para TestFlight y App Store; "sandbox" solo para builds de Xcode.
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production").trim();
const apnsConfigured = !!(APNS_KEY_P8 && APNS_KEY_ID && APNS_TEAM_ID);

// Helper de diagnóstico: escribe en push_debug sin romper (el builder de
// supabase-js NO tiene `.catch`). Tabla opcional; si no existe, se ignora.
async function dbg(admin: ReturnType<typeof createClient>, status: number, reason: string, token_prefix = "-") {
  try { await admin.from("push_debug").insert({ status, reason: reason.slice(0, 500), token_prefix }); } catch (_) { /* ignore */ }
}

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
  if (!apnsConfigured || !tokens.length) {
    await dbg(admin, -1, `skip: apnsConfigured=${apnsConfigured} tokens=${tokens.length}`);
    return 0;
  }
  const host = APNS_ENV === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  let jwt: string;
  try {
    jwt = await apnsJwt();
  } catch (e) {
    await dbg(admin, 0, `jwt_sign_failed: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
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
      if (res.ok) {
        sent++;
        await dbg(admin, 200, "ok", tk.slice(0, 10));
      } else {
        // Motivo EXACTO de APNs (BadDeviceToken, InvalidProviderToken,
        // DeviceTokenNotForTopic, TopicDisallowed, Unregistered…).
        const reason = await res.text().catch(() => "");
        await dbg(admin, res.status, reason, tk.slice(0, 10));
        // Solo se limpia el token cuando el problema es del token en sí
        // (400 BadDeviceToken / 410 Unregistered). Un 403 (auth) NO borra el
        // token: el fallo es de la clave/config, no del dispositivo.
        if (res.status === 410 || (res.status === 400 && /BadDeviceToken|Unregistered/i.test(reason))) {
          await admin.from("device_push_tokens").delete().eq("token", tk);
        }
      }
    } catch (e) {
      await dbg(admin, -6, `apns_fetch_error: ${e instanceof Error ? e.message : String(e)}`, tk.slice(0, 10));
    }
  }));
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    await dbg(admin, -5, `config: service=${!!SERVICE_ROLE} vapid=${!!VAPID_PRIVATE} apnsCfg=${apnsConfigured} p8len=${APNS_KEY_P8.length} kid=[${APNS_KEY_ID}] team=[${APNS_TEAM_ID}] bundle=[${APNS_BUNDLE_ID}] env=${APNS_ENV} p8head=${APNS_KEY_P8.slice(0, 27)}`);

    if (!SERVICE_ROLE || (!VAPID_PRIVATE && !apnsConfigured)) {
      return json({ error: "not_configured" }, 503);
    }

    const { groupId, title, body, url, toUserId, category } = await req.json();
    if (!groupId) return json({ error: "no_group" }, 400);

    // Emisor (desde el JWT) para no notificarse a sí mismo.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let callerId: string | null = null;
    try {
      const { data: { user } } = await admin.auth.getUser(token);
      callerId = user?.id ?? null;
    } catch (_) { callerId = null; }

    // Destinatarios: demás miembros del grupo.
    const { data: members } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    let userIds = [
      ...new Set((members ?? []).map((m) => m.user_id).filter((id) => id && id !== callerId)),
    ];
    if (toUserId) userIds = userIds.filter((id) => id === toUserId);
    if (!userIds.length) {
      await dbg(admin, -3, `no_recipients members=${(members ?? []).length} caller=${callerId ?? "null"}`);
      return json({ sent: 0 });
    }

    // Preferencias de notificación (opt-out): excluir a quien desactivó la categoría.
    if (category) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, notif_prefs")
        .in("id", userIds);
      const off = new Set(
        (profs ?? [])
          .filter((p) => p.notif_prefs && (p.notif_prefs as Record<string, unknown>)[category] === false)
          .map((p) => p.id as string)
      );
      userIds = userIds.filter((id) => !off.has(id));
      if (!userIds.length) {
        await dbg(admin, -4, `all_opted_out category=${category}`);
        return json({ sent: 0, apns: 0, web: 0 });
      }
    }

    // Push nativo (APNs) a los dispositivos iOS de esos usuarios.
    let apnsSent = 0;
    {
      const { data: devices } = await admin
        .from("device_push_tokens")
        .select("token")
        .eq("platform", "ios")
        .in("user_id", userIds);
      const tokens = [...new Set((devices ?? []).map((d) => d.token as string).filter(Boolean))];
      await dbg(admin, -2, `invoke: apnsConfigured=${apnsConfigured} recipients=${userIds.length} iosTokens=${tokens.length}`, tokens[0]?.slice(0, 10) ?? "-");
      if (apnsConfigured) {
        apnsSent = await sendApns(admin, tokens, title || "Settlia", body || "", url || "/");
      }
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
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      })
    );

    return json({ sent: sent + apnsSent, web: sent, apns: apnsSent });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await dbg(admin, 500, `internal_error: ${msg}`);
    return json({ error: "internal", detail: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
