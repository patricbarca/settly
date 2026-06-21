// Cliente de las Edge Functions de IA (escaneo de tickets + transcripción).
// Las funciones viven en supabase/functions/* y se despliegan aparte; si no
// están desplegadas o configuradas, estas llamadas devuelven un error y la UI
// degrada con elegancia (p. ej. el escaneo cae a su demo local).
import { supabase } from "./supabase";

export type ScannedItem = { name: string; price: number };
export type ScanResult = { items: ScannedItem[]; currency?: string };

/** Lee una imagen de ticket vía la función `scan-receipt` (modelo de visión). */
export async function scanReceipt(file: File): Promise<ScanResult> {
  const { base64, mediaType } = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("scan-receipt", {
    body: { image: base64, mediaType },
  });
  if (error) throw error;
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error || "scan_failed");
  }
  const res = data as ScanResult;
  return {
    items: (res.items || [])
      .map((it) => ({ name: String(it.name ?? "").trim(), price: Number(it.price) || 0 }))
      .filter((it) => it.name || it.price),
    currency: res.currency,
  };
}

/** Transcribe un clip de audio vía la función `transcribe` (Whisper). */
export async function transcribeAudio(blob: Blob, lang = "es"): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  form.append("file", blob, `audio.${ext}`);
  form.append("lang", lang);
  const { data, error } = await supabase.functions.invoke("transcribe", {
    body: form,
  });
  if (error) throw error;
  const res = data as { text?: string; error?: string };
  if (!res || res.error) throw new Error(res?.error || "transcribe_failed");
  return (res.text || "").trim();
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({ base64, mediaType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
