// ============================================================
// Settly – Edge Function: parse-expense
// Convierte una nota en lenguaje natural ("cervezas con Ale, pagué 90") en un
// gasto estructurado, eligiendo categoría. Mejora al parser local de regex.
//
// Usa una API compatible con OpenAI (chat completions). Por defecto apunta a
// Groq con `llama-3.1-8b-instant` (rápido y muy barato), reutilizando la misma
// clave que ya configuraste para `transcribe` (STT_API_KEY).
//
// Despliegue:
//   supabase functions deploy parse-expense
//   (la clave ya existe si configuraste el STT: STT_API_KEY=gsk_...)
//
// Configurable con secrets (todos opcionales, con defaults a Groq):
//   AI_TEXT_API_KEY  (def. = STT_API_KEY)
//   AI_TEXT_API_URL  (def. https://api.groq.com/openai/v1/chat/completions)
//   AI_TEXT_MODEL    (def. llama-3.1-8b-instant)
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const API_KEY =
  Deno.env.get("AI_TEXT_API_KEY") ?? Deno.env.get("STT_API_KEY") ?? "";
const API_URL =
  Deno.env.get("AI_TEXT_API_URL") ??
  "https://api.groq.com/openai/v1/chat/completions";
const MODEL = Deno.env.get("AI_TEXT_MODEL") ?? "llama-3.1-8b-instant";

const INTERVALS = ["daily", "weekly", "monthly", "yearly"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!API_KEY) return json({ error: "not_configured" }, 503);

    const { text, members = [], meId, currency, categories = [] } = await req.json();
    if (!text) return json({ error: "no_text" }, 400);

    const memberArr = members as { id: string; name: string }[];
    const memberIds = memberArr.map((m) => m.id);
    const catArr = categories as string[];

    const memberList = memberArr.map((m) => `- ${m.id}: ${m.name}`).join("\n");

    const system = `You convert a natural-language expense note into structured JSON. Reply with ONLY a JSON object, no prose.`;
    const prompt = `Members (id: name):
${memberList}
"me" / "yo" refers to member id: ${meId}
Allowed categories: ${catArr.join(", ")}
Currency: ${currency}

Note: "${text}"

Return a JSON object with exactly these keys:
{"label":"short title","amount":0,"payerId":"<member id>","participantIds":["<member id>",...],"category":"<one allowed category>","interval":null}

Rules:
- amount: numeric total only (no currency symbol; use a dot for decimals).
- payerId: who paid; if unclear, use ${meId}.
- participantIds: members it is split among; if unclear, include ALL member ids.
- category: best match from the allowed list; if none fits use "otros".
- interval: "daily" | "weekly" | "monthly" | "yearly" if recurring, else null.
- Match names loosely: nicknames and diminutives count (e.g. "Ale" -> "Alecita", "Pato" -> "Patricio"). Output member IDS, not names.`;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 512,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error("llm error", res.status, await res.text());
      return json({ error: "upstream" }, 502);
    }

    const data = await res.json();
    const out: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(out);
    if (!parsed) return json({ error: "parse", raw: out }, 422);

    // Saneamos la salida para que sea siempre usable, aunque el modelo se
    // desvíe: IDs válidos, categoría permitida, intervalo válido o null.
    const clean = sanitize(parsed, { memberIds, meId, categories: catArr });
    return json(clean);
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

function sanitize(
  p: Record<string, unknown>,
  ctx: { memberIds: string[]; meId: string; categories: string[] }
) {
  const { memberIds, meId, categories } = ctx;
  const inMembers = (id: unknown) => typeof id === "string" && memberIds.includes(id);

  const payerId = inMembers(p.payerId) ? (p.payerId as string) : meId;

  let participantIds = Array.isArray(p.participantIds)
    ? (p.participantIds as unknown[]).filter(inMembers).map(String)
    : [];
  participantIds = [...new Set(participantIds)];
  if (participantIds.length === 0) participantIds = [...memberIds];

  const category =
    typeof p.category === "string" && categories.includes(p.category)
      ? p.category
      : "otros";

  const interval =
    typeof p.interval === "string" && INTERVALS.includes(p.interval)
      ? p.interval
      : null;

  const amount = Number(p.amount);

  return {
    label: String(p.label ?? "").trim() || "Gasto",
    amount: Number.isFinite(amount) ? amount : 0,
    payerId,
    participantIds,
    category,
    interval,
  };
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
