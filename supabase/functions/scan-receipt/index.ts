// ============================================================
// Settly – Edge Function: scan-receipt
// Lee un ticket con un modelo de visión y devuelve sus líneas + recargos + tax.
//
// Usa una API compatible con OpenAI (chat completions con imagen). Por defecto
// apunta a Groq con Llama 4 Scout (multimodal), reutilizando la misma clave que
// ya configuraste para el STT. NO se usa response_format json_object: el modo
// JSON estricto de Groq con visión rompe la generación (json_validate_failed);
// el prompt ya pide solo JSON y extractJson lo recupera.
//
// Despliegue:
//   supabase functions deploy scan-receipt
//   (la clave ya existe si configuraste el STT: STT_API_KEY=gsk_...)
//
// Configurable con secrets (todos opcionales, con defaults a Groq):
//   AI_VISION_API_KEY  (def. = STT_API_KEY)
//   AI_VISION_API_URL  (def. https://api.groq.com/openai/v1/chat/completions)
//   AI_VISION_MODEL    (def. meta-llama/llama-4-scout-17b-16e-instruct)
// ============================================================

// CORS inline (sin import de ../_shared) para poder pegar este único archivo
// en el editor del dashboard de Supabase.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY =
  Deno.env.get("AI_VISION_API_KEY") ?? Deno.env.get("STT_API_KEY") ?? "";
const API_URL =
  Deno.env.get("AI_VISION_API_URL") ??
  "https://api.groq.com/openai/v1/chat/completions";
const MODEL =
  Deno.env.get("AI_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";

const PROMPT = `You are a receipt/document parser. Read this image (restaurant bill, café, supermarket, utility/phone bill, invoice, etc.) and extract the fields. Respond with ONLY a JSON object, no prose, no markdown:
{"description":"...","subtotal":0.00,"total":0.00,"category":"...","currency":"AUD","items":[{"name":"...","qty":1,"unitPrice":0.00,"price":0.00}],"fees":[{"name":"...","amount":0.00}],"tax":{"amount":0.00,"rate":0,"included":true}}

Rules:
- description: short label for the expense (e.g. "Dinner at Bunny Beans", "Electricity bill"). Max 60 chars.
- items: ONE entry per LINE ITEM that has its OWN price printed in the price column.
  - qty: the quantity of that line. Detect it from "x 2", a leading "2 ...", or from "($X each)" vs the line total. Default 1.
  - unitPrice: price for a SINGLE unit if shown (e.g. "$6.80 each" / "($23.90 each)"). If not shown, use price/qty.
  - price: the LINE TOTAL printed on the right (for the whole quantity).
  - CRITICAL: DO NOT create items for modifiers/options/sub-lines that are INCLUDED in an item's price and have NO price in the right price column — e.g. "Fresh Fruit", "Medium, Lacfree", "Scrambled", "Chorizo", "(... each)", size/extras. Ignore them, or append to the parent item's name. Only emit lines that carry a real price on the right.
  - For non-itemized receipts (utility/invoice) return [].
- fees: extra charges added ON TOP of the items — surcharge, service charge, card/payment surcharge, delivery, weekend/public-holiday surcharge. Each {name, amount}. Do NOT put tax, tip, subtotal or total in fees.
- tax: the tax/GST/VAT line if present — {amount, rate (percent as a number), included (true if the tax is already inside the total, e.g. "10% Tax Included")}. If no tax is shown use {"amount":0,"rate":0,"included":true}.
- subtotal: items subtotal before fees/tax. total: the FINAL amount paid.
- category: one of exactly these — comida, mercado, bebidas, transporte, viajes, alojamiento, ocio, compras, salud, servicios, suscripciones, seguros, regalos, otros.
- currency: ISO 4217 code detected (AUD, USD, EUR, GBP, ARS, CLP, COP, MXN…). Default EUR.
- If you cannot read the image at all: {"description":"","subtotal":0,"total":0,"category":"otros","currency":"EUR","items":[],"fees":[],"tax":{"amount":0,"rate":0,"included":true}}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!API_KEY) return json({ error: "not_configured" }, 503);

    const { image, mediaType } = await req.json();
    if (!image) return json({ error: "no_image" }, 400);

    const dataUrl = `data:${mediaType || "image/jpeg"};base64,${image}`;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("vision error", res.status, await res.text());
      return json({ error: "upstream" }, 502);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";

    const parsed = extractJson(text);
    if (!parsed) return json({ error: "parse", raw: text }, 422);

    return json({
      description: String(parsed.description ?? "").trim().slice(0, 60),
      subtotal: Number(parsed.subtotal) || 0,
      total: Number(parsed.total) || 0,
      category: sanitizeCategory(parsed.category),
      items: sanitizeItems(parsed.items),
      fees: sanitizeFees(parsed.fees),
      tax: sanitizeTax(parsed.tax),
      currency: parsed.currency,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

const VALID_CATEGORIES = ["comida","mercado","bebidas","transporte","viajes","alojamiento","ocio","compras","salud","servicios","suscripciones","seguros","prestamos","regalos","otros"];
function sanitizeCategory(cat: unknown): string {
  const s = String(cat ?? "").trim().toLowerCase();
  return VALID_CATEGORIES.includes(s) ? s : "otros";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeItems(items: unknown): { name: string; qty: number; unitPrice: number; price: number }[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const o = (it ?? {}) as { name?: unknown; qty?: unknown; unitPrice?: unknown; price?: unknown };
      const name = String(o.name ?? "").trim();
      let qty = Math.round(num(o.qty));
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      const price = num(o.price);
      let unitPrice = num(o.unitPrice);
      if (!unitPrice && qty > 0) unitPrice = Math.round((price / qty) * 100) / 100;
      return { name, qty, unitPrice, price };
    })
    .filter((it) => it.name || it.price);
}

function sanitizeFees(fees: unknown): { name: string; amount: number }[] {
  if (!Array.isArray(fees)) return [];
  return fees
    .map((f) => {
      const o = (f ?? {}) as { name?: unknown; amount?: unknown };
      return { name: String(o.name ?? "").trim(), amount: num(o.amount) };
    })
    .filter((f) => Math.abs(f.amount) > 0.0001);
}

function sanitizeTax(tax: unknown): { amount: number; rate: number; included: boolean } {
  const o = (tax ?? {}) as { amount?: unknown; rate?: unknown; included?: unknown };
  return { amount: num(o.amount), rate: num(o.rate), included: o.included !== false };
}

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
