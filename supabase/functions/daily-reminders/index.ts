// ============================================================
// SettliA – Edge Function: daily-reminders (cron diario)
// Recorre los grupos y envía recordatorios push una vez al día:
//   Fase A — si alguien NO ha marcado "agregué todo": se le recuerda que
//            agregue sus gastos y marque su estado.
//   Fase B — cuando TODOS están listos pero el grupo aún no está saldado:
//            se recuerda cada día a quien todavía debe pagar, hasta saldar.
//
// Lo dispara pg_cron (ver supabase/cron_daily_reminders.sql). Se protege con
// un secreto CRON_SECRET para que nadie más pueda invocarlo.
//
// Despliegue:
//   supabase functions deploy daily-reminders --no-verify-jwt
//   supabase secrets set CRON_SECRET=<algo-largo-y-secreto>
//   (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT ya deben estar puestos
//    para send-push; SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY vienen por defecto)
//
// Requiere: tabla push_subscriptions y Web Push configurado (Fase 2).
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
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.settlia.app/";
// Hora local (0–23) a la que enviar el recordatorio. El cron corre cada hora y
// solo enviamos a quien en SU zona horaria sea esta hora.
const REMINDER_HOUR = Number(Deno.env.get("REMINDER_HOUR") ?? "10");

// Hora local (0–23) en una zona IANA. Si la zona es inválida, usa UTC.
function localHour(tz: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date())
    );
  } catch {
    return new Date().getUTCHours();
  }
}
// ¿Es lunes en esa zona? (para grupos "home", recordatorio semanal).
function isLocalMonday(tz: string): boolean {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date()) === "Mon";
  } catch {
    return new Date().getUTCDay() === 1;
  }
}

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// ---- Push NATIVO iOS (APNs) --------------------------------------------------
// Mismo mecanismo que send-push: JWT ES256 firmado con la clave .p8 de Apple.
const APNS_KEY_P8 = Deno.env.get("APNS_KEY_P8") ?? "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "app.settlia.pwa";
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
  if (apnsJwtCache && now - apnsJwtCache.iat < 3000) return apnsJwtCache.token;
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
async function sendApnsOne(
  admin: ReturnType<typeof createClient>,
  tk: string,
  title: string,
  body: string,
  url: string,
): Promise<boolean> {
  if (!apnsConfigured) return false;
  const host = APNS_ENV === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const jwt = await apnsJwt();
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, url });
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
    if (res.ok) return true;
    if (res.status === 410 || res.status === 400) {
      await admin.from("device_push_tokens").delete().eq("token", tk);
    }
  } catch (e) {
    console.error("[apns] send error", e);
  }
  return false;
}

// ---- tipos mínimos (espejo de src/lib/types.ts) ----
interface Member { id: string; name: string }
interface Expense {
  amount: number;
  payerId: string;
  payments?: { memberId: string; amount: number }[];
  participantIds: string[];
  splits?: Record<string, number>;
}
interface Settlement { from: string; to: string; amount: number; status: string }
interface Group {
  name: string;
  currency: string;
  kind?: "trip" | "home";
  members: Member[];
  expenses: Expense[];
  settlements?: Settlement[];
  ready?: string[];
  archived?: boolean;
}

// Saldo neto por miembro (espejo de computeSettle, solo lo necesario).
function netByMember(g: Group): Record<string, number> {
  const ids = g.members.map((m) => m.id);
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  ids.forEach((id) => { paid[id] = 0; owed[id] = 0; });

  for (const e of g.expenses ?? []) {
    if (e.payments?.length) {
      for (const p of e.payments) if (paid[p.memberId] != null) paid[p.memberId] += Number(p.amount || 0);
    } else if (paid[e.payerId] != null) {
      paid[e.payerId] += Number(e.amount || 0);
    }
    if (e.splits) {
      ids.forEach((id) => (owed[id] += Number(e.splits![id] || 0)));
    } else {
      const parts = e.participantIds?.length ? e.participantIds : ids;
      const per = Number(e.amount || 0) / (parts.length || 1);
      parts.forEach((id) => { if (owed[id] != null) owed[id] += per; });
    }
  }
  for (const s of g.settlements ?? []) {
    if (s.status !== "confirmed") continue;
    if (paid[s.from] != null) paid[s.from] += Number(s.amount || 0);
    if (owed[s.to] != null) owed[s.to] += Number(s.amount || 0);
  }
  const net: Record<string, number> = {};
  ids.forEach((id) => (net[id] = Math.round((paid[id] - owed[id]) * 100) / 100));
  return net;
}

function money(n: number, cur: string) {
  return `${cur}${Math.abs(n).toFixed(2)}`;
}

type Target = { kind: "add" | "settle"; group: string; amount?: number; currency?: string; weekly?: boolean };

// Mensaje localizado según el idioma del usuario (es/en).
function buildBody(t: Target, lang: string): string {
  const en = lang === "en";
  if (t.kind === "add") {
    return en
      ? `${t.group}: add your expenses and mark you're done.`
      : `${t.group}: agrega tus gastos y marca que ya terminaste.`;
  }
  const amt = money(t.amount ?? 0, t.currency ?? "");
  return en
    ? `${t.group}: you still owe ${amt}. Time to settle up.`
    : `${t.group}: aún debes ${amt}. Salda tus cuentas.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SERVICE_ROLE || (!VAPID_PRIVATE && !apnsConfigured)) {
      return json({ error: "not_configured" }, 503);
    }
    // Solo el cron (o quien tenga el secreto) puede dispararlo.
    const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "unauthorized" }, 401);

    // body opcional: { "force": true } salta el filtro de hora local (para probar).
    let force = false;
    try { const b = await req.json(); force = !!(b && b.force); } catch { /* sin body */ }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Todos los grupos (la columna data es el JSON del grupo).
    const { data: rows, error } = await admin.from("groups").select("id, data");
    if (error) return json({ error: error.message }, 500);

    // userId -> qué recordarle (el texto se localiza al enviar, según su idioma).
    const targets = new Map<string, Target>();

    for (const row of rows ?? []) {
      const g = row.data as Group;
      if (!g || g.archived) continue;
      const members = g.members ?? [];
      if (members.length === 0) continue;

      // memberId -> userId (los miembros sin cuenta no reciben push).
      const { data: gm } = await admin
        .from("group_members")
        .select("user_id, member_id")
        .eq("group_id", row.id);
      const userOf = new Map<string, string>();
      for (const r of gm ?? []) if (r.member_id && r.user_id) userOf.set(r.member_id, r.user_id);

      if (g.kind === "home") {
        // Casa/continuo: sin "he agregado todo". Solo recordamos a los deudores
        // y de forma SEMANAL (el filtro de "lunes local" se aplica al enviar).
        const net = netByMember(g);
        for (const m of members) {
          const v = net[m.id] ?? 0;
          if (v < -0.01) {
            const uid = userOf.get(m.id);
            if (uid) targets.set(uid, { kind: "settle", group: g.name, amount: v, currency: g.currency, weekly: true });
          }
        }
        continue;
      }

      const ready = g.ready ?? [];
      const notReady = members.filter((m) => !ready.includes(m.id));

      if (notReady.length > 0) {
        // Fase A: solo si el grupo ya tiene actividad (no molestar grupos vacíos).
        if ((g.expenses ?? []).length === 0) continue;
        for (const m of notReady) {
          const uid = userOf.get(m.id);
          if (uid) targets.set(uid, { kind: "add", group: g.name });
        }
      } else {
        // Fase B: todos listos → recordar a quien aún debe pagar.
        const net = netByMember(g);
        for (const m of members) {
          const v = net[m.id] ?? 0;
          if (v < -0.01) {
            const uid = userOf.get(m.id);
            if (uid) targets.set(uid, { kind: "settle", group: g.name, amount: v, currency: g.currency });
          }
        }
      }
    }

    const userIds = [...targets.keys()];
    if (userIds.length === 0) return json({ sent: 0, users: 0 });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, user_id, subscription, lang, tz")
      .in("user_id", userIds);

    let sent = 0;
    await Promise.all(
      (subs ?? []).map(async (s: { endpoint: string; user_id: string; subscription: unknown; lang?: string; tz?: string }) => {
        const tgt = targets.get(s.user_id);
        if (!tgt) return;
        const tz = s.tz || "UTC";
        // Solo enviamos cuando en SU zona horaria son las ~10am (salvo force).
        if (!force && localHour(tz) !== REMINDER_HOUR) return;
        // Grupos "home" = recordatorio semanal (su lunes local).
        if (!force && tgt.weekly && !isLocalMonday(tz)) return;
        const body = buildBody(tgt, s.lang ?? "es");
        const payload = JSON.stringify({ title: "Settlia", body, url: APP_URL });
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

    // ---- Push NATIVO iOS (APNs) — mismos targets, mismo filtro de hora/semana.
    let apnsSent = 0;
    if (apnsConfigured) {
      const { data: devices } = await admin
        .from("device_push_tokens")
        .select("token, user_id, lang, tz")
        .eq("platform", "ios")
        .in("user_id", userIds);
      await Promise.all(
        (devices ?? []).map(async (d: { token: string; user_id: string; lang?: string; tz?: string }) => {
          const tgt = targets.get(d.user_id);
          if (!tgt) return;
          const tz = d.tz || "UTC";
          if (!force && localHour(tz) !== REMINDER_HOUR) return;
          if (!force && tgt.weekly && !isLocalMonday(tz)) return;
          const body = buildBody(tgt, d.lang ?? "es");
          const ok = await sendApnsOne(admin, d.token, "Settlia", body, APP_URL);
          if (ok) apnsSent++;
        })
      );
    }

    return json({ sent: sent + apnsSent, web: sent, apns: apnsSent, users: userIds.length });
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
