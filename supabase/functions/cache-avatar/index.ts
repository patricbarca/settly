// ============================================================
// Settlia – Edge Function: cache-avatar
// Baja la foto de perfil de Google (lh3.googleusercontent.com) UNA vez y la
// guarda como data URL en `profiles.avatar`, para no depender del hotlink de
// Google (que a veces devuelve 403/429 → la foto sale rota y cae a iniciales).
//
// Seguro para exponer (verify_jwt=false): SOLO "repara" — reemplaza el avatar
// cuando el valor guardado actual es una URL de googleusercontent, cacheando esa
// MISMA imagen pública. Nunca pisa una foto subida por el usuario (data:) ni
// expone datos. Idempotente. El servidor de Supabase sí alcanza a Google.
//
// Body: { "userId": "<uuid>" }  → cachea la foto de ese usuario.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SERVICE_ROLE) return json({ error: "not_configured" }, 503);
    const { userId } = await req.json().catch(() => ({}));
    if (!userId) return json({ error: "no_user" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Avatar guardado actual: solo reparamos si es una URL de Google (o vacío).
    const { data: prof } = await admin.from("profiles").select("avatar").eq("id", userId).maybeSingle();
    const current = (prof?.avatar ?? "").trim();
    if (current.startsWith("data:")) return json({ ok: true, skipped: "already_cached" });
    if (current && !/googleusercontent\.com/.test(current)) {
      return json({ ok: true, skipped: "not_google" });
    }

    // URL de Google desde el metadata de auth (fuente de verdad).
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
    let url = (meta.avatar_url as string) || (meta.picture as string) || current;
    if (!url || !/^https?:\/\//.test(url)) return json({ error: "no_google_avatar" }, 404);

    // Pide una resolución razonable para retina (los avatars de Google aceptan =sNNN-c).
    url = url.replace(/=s\d+(-c)?$/, "=s256-c");

    const res = await fetch(url, { headers: { "user-agent": "Settlia/1.0" } });
    if (!res.ok) return json({ error: "fetch_failed", status: res.status }, 502);
    const buf = new Uint8Array(await res.arrayBuffer());
    // Tope de seguridad (los avatars de Google pesan pocos KB).
    if (buf.length > 400_000) return json({ error: "too_large", bytes: buf.length }, 413);
    const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const dataUrl = `data:${type};base64,${toBase64(buf)}`;

    const { error } = await admin.from("profiles").update({ avatar: dataUrl }).eq("id", userId);
    if (error) return json({ error: "save_failed", detail: error.message }, 500);

    return json({ ok: true, bytes: buf.length, type });
  } catch (e) {
    return json({ error: "internal", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
