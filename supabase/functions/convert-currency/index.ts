// ============================================================
// Settly – Edge Function: convert-currency
// Convierte un monto entre dos monedas usando exchangerate-api.com
// (plan free: 1500 req/mes). Se usa cuando un ticket escaneado está en una
// moneda distinta a la del grupo (feature Pro).
//
// Despliegue: supabase functions deploy convert-currency
// Secret requerido: EXCHANGE_RATE_API_KEY
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY = Deno.env.get("EXCHANGE_RATE_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!API_KEY) return json({ error: "not_configured" }, 503);

    const { amount, from, to } = await req.json();
    const from_ = String(from ?? "").toUpperCase().trim();
    const to_ = String(to ?? "").toUpperCase().trim();
    const amt = Number(amount);

    if (!from_ || !to_ || !Number.isFinite(amt)) return json({ error: "bad_request" }, 400);

    // Misma moneda: no hace falta llamar a la API.
    if (from_ === to_) {
      return json({ convertedAmount: amt, rate: 1, from: from_, to: to_, date: null });
    }

    const url = `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${from_}/${to_}/${amt}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("exchangerate-api error", res.status, await res.text());
      return json({ error: "upstream" }, 502);
    }

    const data = await res.json();
    if (data.result !== "success") {
      console.error("exchangerate-api result", data);
      return json({ error: data["error-type"] || "upstream" }, 502);
    }

    return json({
      convertedAmount: Math.round(Number(data.conversion_result) * 100) / 100,
      rate: data.conversion_rate,
      from: from_,
      to: to_,
      date: data.time_last_update_utc ?? null,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});
