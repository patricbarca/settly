// ============================================================
// Settly – Edge Function: scan-receipt
// Lee un ticket con un modelo de visión y devuelve sus líneas.
//
// Usa una API compatible con OpenAI (chat completions con imagen). Por defecto
// apunta a Groq con Llama 4 Scout (multimodal, barato), reutilizando la misma
// clave que ya configuraste para el STT (STT_API_KEY).
//
// Despliegue:
//   supabase functions deploy scan-receipt
//   (la clave ya existe si configuraste el STT: STT_API_KEY=gsk_...)
//
// Configurable con secrets (todos opcionales, con defaults a Groq):
//   AI_VISION_API_KEY  (def. = STT_API_KEY)
//   AI_VISION_API_URL  (def. https://api.groq.com/openai/v1/chat/completions)
//   AI_VISION_MODEL    (def. meta-llama/llama-4-scout-17b-16e-instruct)
// Para más precisión: AI_VISION_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const API_KEY =
  Deno.env.get("AI_VISION_API_KEY") ?? Deno.env.get("STT_API_KEY") ?? "";
const API_URL =
  Deno.env.get("AI_VISION_API_URL") ??
  "https://api.groq.com/openai/v1/chat/completions";
const MODEL =
  Deno.env.get("AI_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";

const PROMPT = `You are a receipt parser. Read this receipt image and extract the
purchased line items. Respond with ONLY a JSON object, no prose, no markdown:
{"items":[{"name":"...","price":0.00}],"currency":"EUR"}
Rules: amounts as numbers (dot decimal); exclude subtotal/total/tax/tip/change
lines; keep item names short; if you can't read it, return {"items":[]}.`;

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
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: "json_object" },
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

    return json({ items: sanitizeItems(parsed.items), currency: parsed.currency });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

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
