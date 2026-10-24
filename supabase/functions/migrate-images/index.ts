// Saca las imágenes en base64 (data URL) de los blobs de grupos y de los perfiles
// y las guarda en el bucket público `media` (img/<sha256>.<ext>), dejando solo la
// URL. Ahorra egress: las fotos ya no viajan dentro de cada grupo en cada descarga.
// La lanza pg_cron cada hora (migrate_v27) para recoger lo que suban apps viejas.
// verify_jwt = false; protegida por CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const cache = new Map<string, string>(); // data URL -> URL pública (dentro de una ejecución)
let uploaded = 0;

async function toUrl(dataUrl: string): Promise<string | null> {
  const hit = cache.get(dataUrl);
  if (hit) return hit;
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m || !m[2]) return null;
  const mime = m[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(m[3]);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null;
  }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const path = `img/${hash}.${ext}`;
  const { error } = await db.storage.from("media").upload(path, bytes, {
    contentType: mime === "image/jpg" ? "image/jpeg" : mime,
    upsert: false,
    cacheControl: "31536000", // el contenido nunca cambia (la ruta es su hash)
  });
  if (error && !/exist|duplicate/i.test(error.message)) {
    console.error("upload", path, error.message);
    return null;
  }
  if (!error) uploaded++;
  const url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
  cache.set(dataUrl, url);
  return url;
}

const isData = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image");

async function fixGroup(data: any): Promise<boolean> {
  let changed = false;
  if (isData(data.heroImage)) {
    const u = await toUrl(data.heroImage);
    if (u) { data.heroImage = u; changed = true; }
  }
  for (const m of data.members ?? []) {
    if (isData(m.avatar)) {
      const u = await toUrl(m.avatar);
      if (u) { m.avatar = u; changed = true; }
    }
  }
  for (const s of data.settlements ?? []) {
    if (isData(s.proof)) {
      const u = await toUrl(s.proof);
      if (u) { s.proof = u; changed = true; }
    }
  }
  return changed;
}

Deno.serve(async (req) => {
  const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!CRON_SECRET || auth !== CRON_SECRET) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  // Perfiles
  let profiles = 0;
  const { data: profs } = await db.from("profiles").select("id, avatar").like("avatar", "data:image%");
  for (const p of profs ?? []) {
    const u = await toUrl(p.avatar);
    if (!u) continue;
    // (No se filtra por el avatar viejo: la data URL entera no cabe en la URL de la petición.)
    const { error } = await db.from("profiles").update({ avatar: u }).eq("id", p.id);
    if (error) console.error("profile", p.id, error.message);
    else profiles++;
  }

  // Grupos (solo los que tienen alguna imagen en línea)
  let groups = 0, skipped = 0;
  const { data: ids } = await db.rpc("groups_with_inline_images");
  for (const { id } of (ids ?? []) as { id: string }[]) {
    const { data: row } = await db.from("groups").select("data, updated_at").eq("id", id).single();
    if (!row) continue;
    const data = row.data;
    if (!(await fixGroup(data))) continue;
    // Solo si nadie lo cambió mientras tanto; si no, se reintenta en la próxima ejecución.
    const { data: upd } = await db.from("groups").update({ data }).eq("id", id).eq("updated_at", row.updated_at).select("id");
    if (upd?.length) groups++; else skipped++;
  }

  const res = { profiles, groups, skipped, uploaded };
  console.log("migrate-images", res);
  return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
});
