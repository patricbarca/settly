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
  currency?: string;
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

export type ScannedItem = { name: string; qty: number; unitPrice: number; price: number };
export type ScanFee = { name: string; amount: number };
export type ScanTax = { amount: number; rate: number; included: boolean; originalAmount?: number };
export type ScanResult = {
  description: string;
  subtotal: number;
  total: number;
  category: Category;
  items: ScannedItem[];
  fees: ScanFee[];
  tax: ScanTax;
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
    subtotal: Number(res.subtotal) || 0,
    total: Number(res.total) || 0,
    category: res.category || "otros",
    items: (res.items || [])
      .map((it) => {
        const price = Number(it.price) || 0;
        let qty = Math.round(Number(it.qty));
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        let unitPrice = Number(it.unitPrice) || 0;
        if (!unitPrice && qty > 0) unitPrice = Math.round((price / qty) * 100) / 100;
        return { name: String(it.name ?? "").trim(), qty, unitPrice, price };
      })
      .filter((it) => it.name || it.price),
    fees: (res.fees || [])
      .map((f) => ({ name: String(f.name ?? "").trim(), amount: Number(f.amount) || 0 }))
      .filter((f) => Math.abs(f.amount) > 0.0001),
    tax: {
      amount: Number(res.tax?.amount) || 0,
      rate: Number(res.tax?.rate) || 0,
      included: res.tax?.included !== false,
    },
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

