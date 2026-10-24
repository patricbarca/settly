// Revisa los servicios de Settlia y guarda el resultado en la tabla service_status.
// La dispara pg_cron cada 15 min (ver supabase/migrate_v23_service_status.sql) con
// el mismo CRON_SECRET que daily-reminders. Solo el admin lo lee, vía get_service_status().
// Despliegue: verify_jwt = false (la protege CRON_SECRET).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const GROQ_KEY = (Deno.env.get("STT_API_KEY") ?? "").trim();
// Modelos que usan las Edge Functions. Groq los retira sin avisar: si falta uno, sale en rojo.
const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "whisper-large-v3-turbo"];
const FUNCTIONS = ["parse-expense", "scan-receipt", "transcribe", "classify-expenses", "forecast-spending", "send-push", "convert-currency"];

type Status = "up" | "degraded" | "down" | "unknown";
type Result = { id: string; name: string; group: string; status: Status; detail: string; ms?: number; page?: string; incidents?: { name: string; status: string; url: string }[] };

async function timed(url: string, opts: RequestInit = {}, ms = 15000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    return { res, body, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function errText(e: unknown) {
  return e instanceof Error && e.name === "AbortError" ? "Sin respuesta (15 s)" : String((e as Error)?.message ?? e).slice(0, 120);
}

// Comprobación directa de un endpoint.
function own(id: string, name: string, group: string, url: string, o: { opts?: RequestInit; ok?: (s: number) => boolean; slow?: number } = {}) {
  const ok = o.ok ?? ((s: number) => s < 400);
  const slow = o.slow ?? 3000;
  return async (): Promise<Result> => {
    try {
      const { res, ms } = await timed(url, o.opts);
      if (!ok(res.status)) return { id, name, group, status: "down", detail: `HTTP ${res.status}`, ms };
      return { id, name, group, status: ms > slow ? "degraded" : "up", detail: ms > slow ? "Lento" : "Responde", ms };
    } catch (e) {
      return { id, name, group, status: "down", detail: errText(e) };
    }
  };
}

// Página de estado pública con formato Atlassian Statuspage.
function statuspage(id: string, name: string, base: string, page: string, cap?: Status) {
  return async (): Promise<Result> => {
    const r = { id, name, group: "Proveedores", page };
    try {
      const { res, body } = await timed(`${base}/api/v2/summary.json`);
      if (!res.ok) return { ...r, status: "unknown", detail: `Sin datos (HTTP ${res.status})` };
      const j = JSON.parse(body);
      const ind = j.status?.indicator ?? "none";
      let status: Status = ind === "none" ? "up" : ind === "minor" || ind === "maintenance" ? "degraded" : "down";
      if (cap && status === "down") status = cap; // servicio no crítico
      const incidents = (j.incidents ?? []).slice(0, 3).map((i: any) => ({ name: String(i.name), status: String(i.status), url: String(i.shortlink ?? page) }));
      return { ...r, status, detail: ind === "none" ? "Sin incidencias" : String(j.status?.description ?? ind), incidents };
    } catch {
      return { ...r, status: "unknown", detail: "No se pudo leer su página de estado" };
    }
  };
}

function apple() {
  return async (): Promise<Result> => {
    const r = { id: "apple", name: "Apple (App Store Connect, TestFlight, notificaciones)", group: "Proveedores", page: "https://developer.apple.com/system-status/" };
    try {
      const { body } = await timed("https://www.apple.com/support/systemstatus/data/developer/system_status_en_US.js");
      const j = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
      const want = /App Store Connect|TestFlight|APNS|Push Notification|In-App Purchase|App Store/i;
      const bad: string[] = [];
      for (const s of j.services ?? []) {
        if (!want.test(s.serviceName)) continue;
        const open = (s.events ?? []).filter((e: any) => e.eventStatus !== "resolved" && e.eventStatus !== "completed");
        if (open.length) bad.push(`${s.serviceName}: ${open[0].statusType ?? "incidencia"}`);
      }
      return bad.length ? { ...r, status: "degraded", detail: bad.slice(0, 3).join(" · ") } : { ...r, status: "up", detail: "Sin incidencias" };
    } catch {
      return { ...r, status: "unknown", detail: "No se pudo leer su página de estado" };
    }
  };
}

function groqModels() {
  return async (): Promise<Result> => {
    const r = { id: "groq-models", name: "Modelos de IA en Groq", group: "Settlia" };
    if (!GROQ_KEY) return { ...r, status: "unknown", detail: "Falta STT_API_KEY" };
    try {
      const { res, body, ms } = await timed("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${GROQ_KEY}` } });
      if (!res.ok) return { ...r, status: "down", detail: `HTTP ${res.status}`, ms };
      const have = new Set((JSON.parse(body).data ?? []).map((m: any) => m.id));
      const missing = GROQ_MODELS.filter((m) => !have.has(m));
      return missing.length
        ? { ...r, status: "down", detail: `Retirados: ${missing.join(", ")}`, ms }
        : { ...r, status: "up", detail: `Los ${GROQ_MODELS.length} modelos siguen disponibles`, ms };
    } catch (e) {
      return { ...r, status: "down", detail: errText(e) };
    }
  };
}

const anon = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
// Un OPTIONS (preflight CORS) basta para saber si la función arranca, sin gastar IA.
const preflight: RequestInit = { method: "OPTIONS", headers: { Origin: "https://app.settlia.app", "Access-Control-Request-Method": "POST" } };

const checks = [
  own("app", "App web (app.settlia.app)", "Settlia", "https://app.settlia.app/"),
  own("landing", "Landing (settlia.app)", "Settlia", "https://settlia.app/"),
  own("sb-auth", "Login", "Settlia", `${SB_URL}/auth/v1/health`, { opts: { headers: anon } }),
  own("sb-db", "Base de datos", "Settlia", `${SB_URL}/rest/v1/groups?select=id&limit=1`, { opts: { headers: anon }, ok: (s) => s < 500, slow: 4000 }),
  own("sb-storage", "Archivos (tickets)", "Settlia", `${SB_URL}/storage/v1/status`, { opts: { headers: anon }, ok: (s) => s < 500 }),
  ...FUNCTIONS.map((f) => own(`fn-${f}`, `Función ${f}`, "Funciones", `${SB_URL}/functions/v1/${f}`, { opts: preflight, slow: 5000 })),
  groqModels(),
  statuspage("supabase", "Supabase", "https://status.supabase.com", "https://status.supabase.com"),
  statuspage("groq", "Groq (IA de texto, voz y tickets)", "https://groqstatus.com", "https://groqstatus.com"),
  own("openrouter", "OpenRouter (respaldo del escáner)", "Proveedores", "https://openrouter.ai/api/v1/models"),
  statuspage("revenuecat", "RevenueCat (compras en iOS)", "https://status.revenuecat.com", "https://status.revenuecat.com"),
  statuspage("stripe", "Stripe (pagos web)", "https://www.stripestatus.com", "https://status.stripe.com"),
  statuspage("resend", "Resend (emails de login)", "https://resend-status.com", "https://resend-status.com"),
  statuspage("github", "GitHub (hosting y CI)", "https://www.githubstatus.com", "https://www.githubstatus.com"),
  statuspage("codemagic", "Codemagic (builds iOS)", "https://status.codemagic.io", "https://status.codemagic.io"),
  statuspage("cloudflare", "Cloudflare (analítica)", "https://www.cloudflarestatus.com", "https://www.cloudflarestatus.com", "degraded"),
  apple(),
];

Deno.serve(async (req) => {
  const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!CRON_SECRET || auth !== CRON_SECRET) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const results = await Promise.all(checks.map((c) => c()));
  const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from("service_status").insert({ results });
  if (error) console.error("service_status insert", error.message);
  // Se guardan 3 días.
  await db.from("service_status").delete().lt("checked_at", new Date(Date.now() - 3 * 86400000).toISOString());

  const bad = results.filter((r) => r.status === "down" || r.status === "degraded").map((r) => `${r.name}: ${r.detail}`);
  return new Response(JSON.stringify({ ok: !error, checks: results.length, bad }), { headers: { "Content-Type": "application/json" } });
});
