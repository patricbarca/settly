// ============================================================
// Settly – Edge Function: transcribe (speech-to-text)
// Transcribe un clip de audio a texto. Pensado para iPhone/Safari, donde
// la Web Speech API del navegador no está disponible.
//
// Despliegue:
//   supabase functions deploy transcribe
//   supabase secrets set STT_API_KEY=sk-...
//
// Por defecto usa OpenAI Whisper (whisper-1, ~$0.006/min). Es configurable:
//   STT_API_URL   (def. https://api.openai.com/v1/audio/transcriptions)
//   STT_MODEL     (def. whisper-1)
// Como la API es compatible con la de OpenAI, puedes apuntar STT_API_URL a
// Groq (https://api.groq.com/openai/v1/audio/transcriptions, más barato/rápido)
// y STT_MODEL a whisper-large-v3-turbo sin tocar el código.
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const STT_API_KEY = Deno.env.get("STT_API_KEY") ?? "";
const STT_API_URL =
  Deno.env.get("STT_API_URL") ?? "https://api.openai.com/v1/audio/transcriptions";
const STT_MODEL = Deno.env.get("STT_MODEL") ?? "whisper-1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!STT_API_KEY) return json({ error: "not_configured" }, 503);

    const inForm = await req.formData();
    const file = inForm.get("file");
    const lang = (inForm.get("lang") as string) || "es";
    if (!(file instanceof File)) return json({ error: "no_audio" }, 400);

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
    return json({ text: data?.text ?? "" });
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
