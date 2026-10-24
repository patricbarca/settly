// Imágenes fuera del blob del grupo: se suben al bucket público `media` como
// img/<sha256>.<ext> y se guarda solo la URL. Ahorra egress (antes cada foto
// viajaba dentro del grupo en cada descarga). La ruta es el hash del contenido,
// así la misma foto se guarda una vez y coincide con lo que hace la Edge Function
// `migrate-images` y la protección de `update_group_data` (migrate_v26).
import { supabase } from "./supabase";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** Convierte una data URL en una URL de `media`. Si algo falla (sin sesión, sin
 *  conexión), devuelve la data URL tal cual: la tarea de cada hora la migra luego. */
export async function toMediaUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  try {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
    const ext = m && EXT[m[1].toLowerCase()];
    if (!m || !ext) return dataUrl;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const path = `img/${hash}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, new Blob([bytes], { type: m[1] }), {
      contentType: m[1],
      upsert: false,
      cacheControl: "31536000",
    });
    if (error && !/exist|duplicate/i.test(error.message)) return dataUrl;
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  } catch {
    return dataUrl;
  }
}
