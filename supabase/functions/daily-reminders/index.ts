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
import { corsHeaders } from "../_shared/cors.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hola@settlia.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.settlia.app/";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!VAPID_PRIVATE || !SERVICE_ROLE) return json({ error: "not_configured" }, 503);
    // Solo el cron (o quien tenga el secreto) puede dispararlo.
    const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Todos los grupos (la columna data es el JSON del grupo).
    const { data: rows, error } = await admin.from("groups").select("id, data");
    if (error) return json({ error: error.message }, 500);

    // userId -> mensaje a enviar (acumulamos por usuario entre grupos).
    const messages = new Map<string, string>();

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

      const ready = g.ready ?? [];
      const notReady = members.filter((m) => !ready.includes(m.id));

      if (notReady.length > 0) {
        // Fase A: solo si el grupo ya tiene actividad (no molestar grupos vacíos).
        if ((g.expenses ?? []).length === 0) continue;
        for (const m of notReady) {
          const uid = userOf.get(m.id);
          if (uid) messages.set(uid, `${g.name}: agrega tus gastos y marca que ya terminaste.`);
        }
      } else {
        // Fase B: todos listos → recordar a quien aún debe pagar.
        const net = netByMember(g);
        for (const m of members) {
          const v = net[m.id] ?? 0;
          if (v < -0.01) {
            const uid = userOf.get(m.id);
            if (uid) messages.set(uid, `${g.name}: aún debes ${money(v, g.currency)}. Salda tus cuentas.`);
          }
        }
      }
    }

    const userIds = [...messages.keys()];
    if (userIds.length === 0) return json({ sent: 0, users: 0 });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, user_id, subscription")
      .in("user_id", userIds);

    let sent = 0;
    await Promise.all(
      (subs ?? []).map(async (s: { endpoint: string; user_id: string; subscription: unknown }) => {
        const body = messages.get(s.user_id);
        if (!body) return;
        const payload = JSON.stringify({ title: "SettliA", body, url: APP_URL });
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

    return json({ sent, users: userIds.length });
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
