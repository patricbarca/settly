// ============================================================
// Settly – Edge Function: scan-receipt
// Lee un ticket con un modelo de visión y devuelve sus líneas.
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
import { corsHeaders } from "../_shared/cors.ts";

const API_KEY =
  Deno.env.get("AI_VISION_API_KEY") ?? Deno.env.get("STT_API_KEY") ?? "";
const API_URL =
  Deno.env.get("AI_VISION_API_URL") ??
  "https://api.groq.com/openai/v1/chat/completions";
const MODEL =
  Deno.env.get("AI_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";

const PROMPT = `You are a receipt/document parser. Read this image — it may be a restaurant bill, utility bill (electricity, water, gas), bank statement, invoice, or any other receipt — and extract the key fields. Respond with ONLY a JSON object, no prose, no markdown:
{"description":"...","total":0.00,"category":"...","items":[{"name":"...","price":0.00}],"currency":"EUR"}

Rules:
- description: short label for the expense (e.g. "Electricity bill", "Dinner at Trattoria", "Internet invoice"). Max 60 chars.
- total: the final amount due/paid as a number (dot decimal). Use the TOTAL or AMOUNT DUE line, not subtotal.
- category: one of exactly these values — comida, mercado, bebidas, transporte, viajes, alojamiento, ocio, compras, salud, servicios, suscripciones, seguros, regalos, otros. Pick the most fitting one (servicios for utilities/bills/invoices, comida for restaurants, suscripciones for Netflix/Spotify/memberships, seguros for any insurance, etc.)
- items: array of individual line items if the receipt is itemized (restaurant, supermarket). For non-itemized receipts (utility bills, invoices) return an empty array [].
- currency: ISO 4217 code detected from the receipt (EUR, USD, GBP, ARS, CLP, COP, MXN…). Default EUR.
- If you cannot read the image at all, return: {"description":"","total":0,"category":"otros","items":[],"currency":"EUR"}`;

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
        // Sin response_format json_object: en los modelos de visión de Groq el
        // modo JSON estricto falla con json_validate_failed si la generación no
        // es perfecta. El prompt ya pide "solo JSON" y extractJson lo recupera.
        model: MODEL,
        max_tokens: 1024,
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
      total: Number(parsed.total) || 0,
      category: sanitizeCategory(parsed.category),
      items: sanitizeItems(parsed.items),
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

function sanitizeItems(items: unknown): { name: string; price: number }[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const name = String((it as { name?: unknown })?.name ?? "").trim();
      const price = Number((it as { price?: unknown })?.price);
      return { name, price: Number.isFinite(price) ? price : 0 };
    })
    .filter((it) => it.name || it.price);
}

function extractJson(text: string): { items?: unknown[]; currency?: string } | null {
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
