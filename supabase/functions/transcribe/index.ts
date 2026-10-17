// Settly – Edge Function: transcribe (speech-to-text)
// Recibe un clip de audio y lo transcribe vía Groq (API compatible OpenAI).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STT_API_KEY = Deno.env.get("STT_API_KEY") ?? "";
const STT_API_URL =
  Deno.env.get("STT_API_URL") ?? "https://api.openai.com/v1/audio/transcriptions";
const STT_MODEL = Deno.env.get("STT_MODEL") ?? "whisper-1";
// Tope de tamaño del audio (un dictado de gasto dura segundos).
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await aiGuard(req, "voice");
  if (guard) return guard;

  try {
    if (!STT_API_KEY) return json({ error: "not_configured" }, 503);

    const inForm = await req.formData();
    const file = inForm.get("file");
    const langIn = String(inForm.get("lang") || "es");
    const lang = /^[a-z]{2}$/.test(langIn) ? langIn : "es";
    if (!(file instanceof File)) return json({ error: "no_audio" }, 400);
    if (file.size > MAX_AUDIO_BYTES) return json({ error: "too_large" }, 413);

    const outForm = new FormData();
    outForm.append("file", file, file.name || "audio.webm");
    outForm.append("model", STT_MODEL);
    outForm.append("language", lang);

    const res = await fetch(STT_API_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${STT_API_KEY}` },
      body: outForm,
    });

    if (!res.ok) {
      console.error("stt error", res.status, await res.text());
      return json({ error: "upstream" }, 502);
    }

    const data = await res.json();
    return json({ text: String(data?.text ?? "").slice(0, 1000) });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

/** Límite de uso de la IA en el SERVIDOR (RPC `ai_guard`, migrate_v21): corta
 *  el abuso de alguien que llame a esta función saltándose la app. Si el
 *  propio control falla (red, RPC), no bloquea al usuario: solo se registra. */
async function aiGuard(req: Request, kind: string): Promise<Response | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return null;
    const r = await fetch(`${url}/rest/v1/rpc/ai_guard`, {
      method: "POST",
      headers: {
        apikey: anon,
        authorization: req.headers.get("authorization") ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_kind: kind }),
    });
    if (!r.ok) {
      console.error("ai_guard http", r.status);
      return null;
    }
    if ((await r.json()) === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  } catch (e) {
    console.error("ai_guard", e);
  }
  return null;
}
