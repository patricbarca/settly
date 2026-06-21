// ============================================================
// Settly – Edge Function: parse-expense
// Convierte lenguaje natural (texto dictado/escrito) o la foto de un ticket en
// un gasto estructurado y categorizado, listo para rellenar el formulario.
//
// Despliegue:
//   supabase functions deploy parse-expense
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// La clave vive SOLO en el servidor (nunca en el cliente). El modelo es
// configurable con AI_MODEL (por defecto Claude Haiku 4.5, el más barato de
// Claude con visión). Devuelve siempre JSON; si no se puede leer, devuelve un
// gasto vacío para que el cliente pueda caer a su parser local.
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5";

const CATEGORIES = ["comida", "transporte", "alojamiento", "ocio", "compras", "otros"];
const INTERVALS = ["daily", "weekly", "monthly", "yearly"];

type Member = { id: string; name: string };

function systemPrompt(members: Member[], meId: string, currency: string): string {
  const roster = members.map((m) => `- ${m.name} (id: ${m.id})`).join("\n");
  return `You turn a casual description of a shared expense (typed, dictated, or
read from a receipt photo) into one structured expense for a bill-splitting app.

Group members (use these exact ids):
${roster}

The current user ("me", "yo", "I", "pagué") has id: ${meId}
Default currency: ${currency}

Respond with ONLY a JSON object, no prose, no markdown:
{
  "label": "short title, 1-4 words, Capitalized, in the language of the input",
  "amount": 0.00,
  "payerId": "<member id who paid>",
  "participantIds": ["<member ids who share this expense>"],
  "category": "one of: ${CATEGORIES.join(", ")}",
  "interval": null
}

Rules:
- amount: total of the expense as a number with dot decimals. On a receipt use the
  grand TOTAL (ignore subtotal/tax/tip/change lines). If unknown, use 0.
- payerId: who paid. Default to the current user (${meId}) unless another member
  is clearly named as the payer.
- participantIds: everyone splitting the cost. If names are mentioned, include
  them plus the payer. If it says "everyone"/"todos"/"the group", or no one is
  named, include ALL member ids. Always include the payer.
- category: best fit from the list; use "otros" if unsure.
- interval: one of ${INTERVALS.join(", ")} only if the expense clearly repeats
  (e.g. "every month", "weekly rent"); otherwise null.
- Match member names loosely (first name, accents, lowercase). Never invent ids.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);

    const body = await req.json();
    const {
      text,
      image,
      mediaType,
      members,
      meId,
      currency,
    }: {
      text?: string;
      image?: string;
      mediaType?: string;
      members?: Member[];
      meId?: string;
      currency?: string;
    } = body ?? {};

    if (!Array.isArray(members) || !members.length || !meId) {
      return json({ error: "no_group" }, 400);
    }
    if (!text?.trim() && !image) return json({ error: "no_input" }, 400);

    const content: unknown[] = [];
    if (image) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType || "image/jpeg", data: image },
      });
      content.push({
        type: "text",
        text: text?.trim()
          ? `Receipt photo. Extra context from the user: "${text.trim()}"`
          : "Read this receipt photo and produce the expense.",
      });
    } else {
      content.push({ type: "text", text: text!.trim() });
    }

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
        system: systemPrompt(members, meId, currency || "EUR"),
        messages: [{ role: "user", content }],
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

    return json(normalize(parsed, members, meId));
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

function normalize(p: Record<string, unknown>, members: Member[], meId: string) {
  const ids = new Set(members.map((m) => m.id));
  let payerId = typeof p.payerId === "string" && ids.has(p.payerId) ? p.payerId : meId;
  let participantIds = Array.isArray(p.participantIds)
    ? p.participantIds.filter((id): id is string => typeof id === "string" && ids.has(id))
    : [];
  if (!participantIds.length) participantIds = members.map((m) => m.id);
  if (!participantIds.includes(payerId)) participantIds = [payerId, ...participantIds];

  const category =
    typeof p.category === "string" && CATEGORIES.includes(p.category) ? p.category : "otros";
  const interval =
    typeof p.interval === "string" && INTERVALS.includes(p.interval) ? p.interval : undefined;
  const amount = Math.max(0, Number(p.amount) || 0);
  const label =
    typeof p.label === "string" && p.label.trim() ? p.label.trim().slice(0, 60) : "Gasto";

  return { label, amount, payerId, participantIds, category, ...(interval ? { interval } : {}) };
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
