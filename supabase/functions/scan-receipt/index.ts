// ============================================================
// Settly – Edge Function: scan-receipt
// Lee un ticket con un modelo de visión y devuelve sus líneas + recargos + tax.
//
// Usa una API compatible con OpenAI (chat completions con imagen). Por defecto
// apunta a Groq con Qwen3.6-27B (multimodal, reemplazo del deprecado Llama 4
// Scout), reutilizando la clave del STT. NO se usa response_format json_object:
// el modo JSON estricto con visión rompe la generación; el prompt pide solo
// JSON y extractJson lo recupera.
//
// FAILOVER: si el proveedor primario falla (HTTP/timeout/parse), cae al backup.
//
// Despliegue:
//   supabase functions deploy scan-receipt
//   (la clave ya existe si configuraste el STT: STT_API_KEY=gsk_...)
//
// Secrets (todos opcionales):
//   PRIMARIO (def. Groq):
//     AI_VISION_API_KEY  (def. = STT_API_KEY)
//     AI_VISION_API_URL  (def. https://api.groq.com/openai/v1/chat/completions)
//     AI_VISION_MODEL    (def. qwen/qwen3.6-27b)
//   BACKUP (solo activo si defines la key):
//     AI_VISION_BACKUP_API_KEY  (p. ej. una key de OpenRouter sk-or-... o Gemini)
//     AI_VISION_BACKUP_API_URL  (def. https://openrouter.ai/api/v1/chat/completions)
//     AI_VISION_BACKUP_MODEL    (def. qwen/qwen2.5-vl-72b-instruct)
// ============================================================

// CORS inline (sin import de ../_shared) para poder pegar este único archivo
// en el editor del dashboard de Supabase.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- Proveedores de visión con FAILOVER ----------
// Se prueba el proveedor primario y, si falla (error HTTP, timeout o JSON no
// parseable), se cae automáticamente al backup. Así, si Groq vuelve a caer o
// deprecar la visión, el scan sigue funcionando sin tocar nada.
//
//   PRIMARIO  = Groq (rápido, LPU). Usa AI_VISION_API_KEY si está, si no
//               STT_API_KEY. URL/modelo por AI_VISION_API_URL/AI_VISION_MODEL
//               o los defaults de Groq.
//   BACKUP    = solo si defines AI_VISION_BACKUP_API_KEY (p. ej. una key de
//               OpenRouter o Gemini). URL/modelo por AI_VISION_BACKUP_API_URL/
//               AI_VISION_BACKUP_MODEL (defaults: OpenRouter + Gemini Flash).
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "qwen/qwen3.6-27b"; // reemplazo multimodal de Llama 4 Scout (deprecado)
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type Provider = { name: string; url: string; model: string; key: string };

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  // Primario
  const primaryKey =
    Deno.env.get("AI_VISION_API_KEY") || Deno.env.get("STT_API_KEY") || "";
  if (primaryKey) {
    providers.push({
      name: "primary",
      key: primaryKey,
      url: Deno.env.get("AI_VISION_API_URL") || GROQ_URL,
      model: Deno.env.get("AI_VISION_MODEL") || GROQ_MODEL,
    });
  }

  // Backup (opcional) — distinto proveedor para sobrevivir una caída del primario
  const backupKey = Deno.env.get("AI_VISION_BACKUP_API_KEY") || "";
  if (backupKey) {
    providers.push({
      name: "backup",
      key: backupKey,
      url: Deno.env.get("AI_VISION_BACKUP_API_URL") || OPENROUTER_URL,
      // Qwen2.5-VL 72B en OpenRouter (confirmado disponible en la cuenta). Se
      // puede sobreescribir con AI_VISION_BACKUP_MODEL.
      model: Deno.env.get("AI_VISION_BACKUP_MODEL") || "qwen/qwen2.5-vl-72b-instruct",
    });
  }

  return providers;
}

// Tiempo máximo por proveedor antes de pasar al siguiente (evita que un
// proveedor colgado bloquee el failover).
const PER_PROVIDER_TIMEOUT_MS = 20_000;

const PROMPT = `You are a receipt/document parser. Read this image (restaurant bill, café, supermarket, utility/phone bill, invoice, etc.) and extract the fields. Respond with ONLY a JSON object, no prose, no markdown:
{"description":"...","subtotal":0.00,"total":0.00,"category":"...","currency":"AUD","items":[{"name":"...","qty":1,"unitPrice":0.00,"price":0.00}],"fees":[{"name":"...","amount":0.00}],"tax":{"amount":0.00,"rate":0,"included":true}}

Rules:
- description: short label for the expense (e.g. "Dinner at Bunny Beans", "Electricity bill", "Aldi groceries"). Max 60 chars.
- items: ONE entry per LINE ITEM that has its OWN price printed in the price column.
  - ALIGNMENT IS CRITICAL: read each row LEFT-TO-RIGHT as one line. The item name is on the left; its price is the RIGHTMOST money value on that SAME horizontal line. Supermarket receipts (Aldi, Coles, Woolworths…) leave a WIDE gap between the name and the price and list many rows — do NOT shift a price up or down to the wrong row. If two adjacent rows look swapped, re-check which price sits on which line.
  - Do NOT emit the SUBTOTAL, TOTAL, AMOUNT, GST/TAX summary, change, or payment/card lines as items — those are totals, not line items.
  - qty: the quantity of that line. Detect it from "x 2", a leading "2 ...", or from "($X each)" vs the line total. Default 1.
  - unitPrice: price for a SINGLE unit if shown (e.g. "$6.80 each" / "($23.90 each)"). If not shown, use price/qty.
  - price: the LINE TOTAL printed on the right (for the whole quantity).
  - SELF-CHECK: the sum of all item prices should equal the printed subtotal. If your extracted items don't add up to the subtotal, you misread a price or an alignment — fix it before answering.
  - CRITICAL: DO NOT create items for modifiers/options/sub-lines that are INCLUDED in an item's price and have NO price in the right price column — e.g. "Fresh Fruit", "Medium, Lacfree", "Scrambled", "Chorizo", "(... each)", size/extras. Ignore them, or append to the parent item's name. Only emit lines that carry a real price on the right.
  - For non-itemized receipts (utility/invoice) return [].
- fees: extra charges added ON TOP of the items — surcharge, service charge, card/payment surcharge, delivery, weekend/public-holiday surcharge. Each {name, amount}. Do NOT put tax, tip, subtotal or total in fees.
- tax: the tax/GST/VAT line if present — {amount, rate (percent as a number), included (true if the tax is already inside the total, e.g. "10% Tax Included")}. If no tax is shown use {"amount":0,"rate":0,"included":true}.
  - CRITICAL: many receipts (Australia/NZ especially) print a "GST Sales" / "GST Amount" (or "Tax Sales" / "Tax Amount") breakdown near the bottom purely as a statutory disclosure of the tax portion ALREADY inside the prices — it is NOT an extra charge to add. If the printed subtotal equals (or is within a cent of) the final total/amount paid, the tax is included: set included:true. Only set included:false when the tax amount is clearly added ON TOP — i.e. subtotal + tax ≈ total, with total strictly greater than subtotal.
- subtotal: items subtotal before fees/tax. total: the FINAL amount paid.
- category: one of exactly these — comida, mercado, bebidas, transporte, viajes, alojamiento, ocio, compras, salud, servicios, suscripciones, seguros, regalos, otros.
- currency: ISO 4217 code detected (AUD, USD, EUR, GBP, ARS, CLP, COP, MXN…). Default EUR.
- If you cannot read the image at all: {"description":"","subtotal":0,"total":0,"category":"otros","currency":"EUR","items":[],"fees":[],"tax":{"amount":0,"rate":0,"included":true}}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const providers = buildProviders();
    if (providers.length === 0) return json({ error: "not_configured" }, 503);

    const { image, mediaType } = await req.json();
    if (!image) return json({ error: "no_image" }, 400);

    const dataUrl = `data:${mediaType || "image/jpeg"};base64,${image}`;
    // max_tokens holgado: qwen3.6-27b puede "pensar" antes de responder; damos
    // margen para que el JSON final no salga cortado (y en Groq desactivamos el
    // thinking abajo con reasoning_effort:"none").
    const basePayload = {
      max_tokens: 3000,
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
    };

    // Failover: prueba cada proveedor en orden; el primero que responda un JSON
    // válido gana. Si uno falla (HTTP, timeout o parse), se prueba el siguiente.
    let lastError = "";
    for (const p of providers) {
      const parsed = await callProvider(p, basePayload);
      if (parsed.ok) {
        return json({
          _provider: p.name, // útil para depurar cuál respondió
          description: String(parsed.value.description ?? "").trim().slice(0, 60),
          subtotal: Number(parsed.value.subtotal) || 0,
          total: Number(parsed.value.total) || 0,
          category: sanitizeCategory(parsed.value.category),
          items: sanitizeItems(parsed.value.items),
          fees: sanitizeFees(parsed.value.fees),
          tax: sanitizeTax(parsed.value.tax),
          currency: parsed.value.currency,
        });
      }
      lastError = parsed.error;
      console.error(`vision provider "${p.name}" failed:`, parsed.error);
    }

    // Todos los proveedores fallaron.
    return json({ error: "upstream", detail: lastError }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

/** Llama a un proveedor concreto con timeout. Devuelve el JSON parseado o un
 *  error legible para poder pasar al siguiente proveedor. */
async function callProvider(
  p: Provider,
  basePayload: Record<string, unknown>,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_PROVIDER_TIMEOUT_MS);
  try {
    // Inyecta el modelo de ESTE proveedor. En Groq desactivamos el "thinking"
    // (reasoning_effort:"none") para que devuelva el JSON directo y rápido; los
    // modelos Qwen3 de Groq razonan por defecto y se comen los tokens de salida.
    const payload: Record<string, unknown> = { model: p.model, ...basePayload };
    if (/groq\.com/.test(p.url)) payload.reasoning_effort = "none";

    const res = await fetch(p.url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        authorization: `Bearer ${p.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `${p.name} HTTP ${res.status}: ${t.slice(0, 200)}` };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed) return { ok: false, error: `${p.name} unparseable response` };
    return { ok: true, value: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `${p.name} ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

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
  // Quita bloques de "thinking" (<think>…</think>) y fences de código que
  // algunos modelos añaden, para dejar solo el JSON.
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/```(?:json)?/gi, "");
  const m = t.match(/\{[\s\S]*\}/);
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
