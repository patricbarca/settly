import { createClient } from "npm:@supabase/supabase-js@2";

// Baja UNA vez la foto de Google del usuario (Google bloquea el hotlink desde el
// navegador) y la guarda como data URL en profiles.avatar.
// Seguridad (2026-10-17): exige sesión y actúa SOLO sobre el usuario del JWT
// (antes aceptaba cualquier userId sin sesión), y solo descarga de
// *.googleusercontent.com con respuesta de tipo imagen — la URL sale de
// user_metadata, que el propio usuario puede editar, así que sin esto la
// función podía descargar cualquier dirección (SSRF).
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

const isGoogleImageUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)googleusercontent\.com$/.test(url.hostname);
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SERVICE_ROLE) return json({ error: "not_configured" }, 503);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = await admin.auth.getUser(token);
    const userId = who?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: prof } = await admin.from("profiles").select("avatar").eq("id", userId).maybeSingle();
    const current = (prof?.avatar ?? "").trim();
    if (current.startsWith("data:")) return json({ ok: true, skipped: "already_cached" });
    if (current && !isGoogleImageUrl(current)) return json({ ok: true, skipped: "not_google" });

    const meta = (who.user!.user_metadata ?? {}) as Record<string, unknown>;
    let url = (meta.avatar_url as string) || (meta.picture as string) || current;
    if (!url || !isGoogleImageUrl(url)) return json({ error: "no_google_avatar" }, 404);
    url = url.replace(/=s\d+(-c)?$/, "=s256-c");

    const res = await fetch(url, { headers: { "user-agent": "Settlia/1.0" }, redirect: "error" });
    if (!res.ok) return json({ error: "fetch_failed", status: res.status }, 502);
    const type = (res.headers.get("content-type")?.split(";")[0] || "").toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return json({ error: "not_image" }, 415);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 400000) return json({ error: "too_large" }, 413);
    const dataUrl = `data:${type};base64,${toBase64(buf)}`;

    const { error } = await admin.from("profiles").update({ avatar: dataUrl }).eq("id", userId);
    if (error) return json({ error: "save_failed" }, 500);
    return json({ ok: true, bytes: buf.length, type });
  } catch (e) {
    console.error("cache-avatar", e);
    return json({ error: "internal" }, 500);
  }
});
