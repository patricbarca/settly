// ============================================================
// Settly – Edge Function: convert-currency
// Convierte un monto entre dos monedas usando exchangerate-api.com
// (plan free: 1500 req/mes). Se usa cuando un ticket escaneado está en una
// moneda distinta a la del grupo (feature Pro).
//
// Protección:
//   - Solo usuarios con sesión (la anon key no basta) → 401.
//   - Tope por usuario: 100 conversiones / 24 h (RPC call_guard) → 429.
//   - Códigos ISO 4217 validados (3 letras) antes de armar la URL.
//   - Tasa cacheada por par 6 h en memoria: la API solo actualiza una vez
//     al día, así que no hace falta gastar una petición por conversión.
//
// Despliegue: supabase functions deploy convert-currency
// Secret requerido: EXCHANGE_RATE_API_KEY
// ============================================================
import { callGuard, userIdFrom } from "../_shared/callGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY = Deno.env.get("EXCHANGE_RATE_API_KEY");
const CODE = /^[A-Z]{3}$/;
const CACHE_MS = 6 * 60 * 60 * 1000;
const rateCache = new Map<string, { rate: number; date: string | null; at: number }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function pairRate(from: string, to: string): Promise<{ rate: number; date: string | null } | { error: string }> {
  const key = `${from}/${to}`;
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;

  const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${from}/${to}`);
  if (!res.ok) {
    console.error("exchangerate-api error", res.status, await res.text());
    return { error: "upstream" };
  }
  const data = await res.json();
  const rate = Number(data.conversion_rate);
  if (data.result !== "success" || !Number.isFinite(rate)) {
    console.error("exchangerate-api result", data["error-type"] ?? data.result);
    return { error: data["error-type"] || "upstream" };
  }
  const entry = { rate, date: data.time_last_update_utc ?? null, at: Date.now() };
  rateCache.set(key, entry);
  return entry;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!API_KEY) return json({ error: "not_configured" }, 503);

    if (!(await userIdFrom(req))) return json({ error: "unauthorized" }, 401);

    const { amount, from, to } = await req.json();
    const from_ = String(from ?? "").toUpperCase().trim();
    const to_ = String(to ?? "").toUpperCase().trim();
    const amt = Number(amount);

    if (!CODE.test(from_) || !CODE.test(to_) || !Number.isFinite(amt) || Math.abs(amt) > 1e12) {
      return json({ error: "bad_request" }, 400);
    }

    // Misma moneda: no hace falta llamar a la API (ni contar la llamada).
    if (from_ === to_) {
      return json({ convertedAmount: amt, rate: 1, from: from_, to: to_, date: null });
    }

    if (!(await callGuard(req, "fx"))) return json({ error: "rate_limited" }, 429);

    const r = await pairRate(from_, to_);
    if ("error" in r) return json({ error: r.error }, 502);

    return json({
      convertedAmount: Math.round(amt * r.rate * 100) / 100,
      rate: r.rate,
      from: from_,
      to: to_,
      date: r.date,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});
