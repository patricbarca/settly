// Cliente de las Edge Functions de IA (escaneo de tickets + transcripción).
// Las funciones viven en supabase/functions/* y se despliegan aparte; si no
// están desplegadas o configuradas, estas llamadas devuelven un error y la UI
// degrada con elegancia (p. ej. el escaneo cae a su demo local).
import { supabase } from "./supabase";
import { fileToScanImage } from "./image";
import type { Member, Category, RecurrenceInterval } from "./types";

export type AIParsedExpense = {
  label: string;
  amount: number;
  payerId: string;
  payments?: { memberId: string; amount: number }[];
  participantIds: string[];
  category: Category;
  interval?: RecurrenceInterval | null;
};

/** Analiza una nota de gasto en lenguaje natural con un LLM (función
 *  `parse-expense`) y devuelve el gasto estructurado + categoría. */
export async function parseExpenseAI(
  text: string,
  members: Member[],
  meId: string,
  currency: string,
  categories: string[]
): Promise<AIParsedExpense> {
  const { data, error } = await supabase.functions.invoke("parse-expense", {
    body: {
      text,
      members: members.map((m) => ({ id: m.id, name: m.name })),
      meId,
      currency,
      categories,
    },
  });
  if (error) throw error;
  const res = data as AIParsedExpense & { error?: string };
  if (!res || (res as { error?: string }).error) {
    throw new Error((res as { error?: string })?.error || "parse_failed");
  }
  return res;
}

export type ScannedItem = { name: string; price: number };
export type ScanResult = {
  description: string;
  total: number;
  category: Category;
  items: ScannedItem[];
  currency?: string;
};

/** Lee una imagen de ticket vía la función `scan-receipt` (modelo de visión).
 *  La foto se redimensiona/comprime antes de enviarla (ver fileToScanImage). */
export async function scanReceipt(file: File): Promise<ScanResult> {
  const { base64, mediaType } = await fileToScanImage(file);
  const { data, error } = await supabase.functions.invoke("scan-receipt", {
    body: { image: base64, mediaType },
  });
  if (error) throw error;
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error || "scan_failed");
  }
  const res = data as ScanResult;
  return {
    description: String(res.description ?? "").trim(),
    total: Number(res.total) || 0,
    category: res.category || "otros",
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

