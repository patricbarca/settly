// ============================================================
// Settly – Edge Function: parse-expense
// Convierte una nota en lenguaje natural ("cena con Ale, pagué 90") en un gasto
// estructurado, eligiendo categoría. Sustituye/mejora al parser local de regex.
//
// Despliegue:
//   supabase functions deploy parse-expense
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (compartida con scan-receipt)
// Modelo configurable con AI_TEXT_MODEL (por defecto Claude Haiku 4.5).
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("AI_TEXT_MODEL") ?? "claude-haiku-4-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);

    const { text, members = [], meId, currency, categories = [] } = await req.json();
    if (!text) return json({ error: "no_text" }, 400);

    const memberList = (members as { id: string; name: string }[])
      .map((m) => `- ${m.id}: ${m.name}`)
      .join("\n");

    const prompt = `You convert a natural-language expense note into structured JSON.

Members (id: name):
${memberList}
"me" / "yo" refers to member id: ${meId}
Allowed categories: ${(categories as string[]).join(", ")}
Currency: ${currency}

Note: "${text}"

Return ONLY a JSON object, no prose:
{"label":"short title","amount":0,"payerId":"<member id>","participantIds":["<member id>",...],"category":"<one allowed id>","interval":null}

Rules:
- amount: numeric total only (no currency symbol; use dot for decimals).
- payerId: who paid; if unclear, use ${meId}.
- participantIds: members it is split among; if unclear, include ALL member ids.
- category: best match from the allowed list; if none fits use "otros".
- interval: "daily" | "weekly" | "monthly" | "yearly" if recurring, else null.
- Match names loosely (first name, accents, case). Output member IDS, not names.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("anthropic error", res.status, await res.text());
      return json({ error: "upstream" }, 502);
    }

    const data = await res.json();
    const out: string =
      data?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
    const parsed = extractJson(out);
    if (!parsed) return json({ error: "parse", raw: out }, 422);
    return json(parsed);
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

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
