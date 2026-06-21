// ============================================================
// Settly – Edge Function: scan-receipt
// Lee un ticket con un modelo de visión y devuelve sus líneas.
//
// Despliegue:
//   supabase functions deploy scan-receipt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// La clave vive SOLO en el servidor (nunca en el cliente). El modelo es
// configurable con AI_VISION_MODEL (por defecto Claude Haiku 4.5, el más
// barato de Claude con visión; ~0,4 céntimos por escaneo).
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("AI_VISION_MODEL") ?? "claude-haiku-4-5";

const PROMPT = `You are a receipt parser. Read this receipt image and extract the
purchased line items. Respond with ONLY a JSON object, no prose, no markdown:
{"items":[{"name":"...","price":0.00}],"currency":"EUR"}
Rules: amounts as numbers (dot decimal); exclude subtotal/total/tax/tip/change
lines; keep item names short; if you can't read it, return {"items":[]}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "not_configured" }, 503);
    }

    const { image, mediaType } = await req.json();
    if (!image) return json({ error: "no_image" }, 400);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: image,
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("anthropic error", res.status, await res.text());
      return json({ error: "upstream" }, 502);
    }

    const data = await res.json();
    const text: string =
      data?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

    const parsed = extractJson(text);
    if (!parsed) return json({ error: "parse", raw: text }, 422);

    return json({ items: parsed.items ?? [], currency: parsed.currency });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

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
