import { supabase } from "./supabase";

export interface FxResult {
  convertedAmount: number;
  rate: number;
  from: string;
  to: string;
  date: string | null;
}

/** Convierte un monto entre dos monedas ISO 4217 vía la Edge Function
 *  `convert-currency` (exchangerate-api.com). Devuelve null si falla (el
 *  llamador debe conservar el monto original en ese caso). */
export async function convertCurrency(amount: number, from: string, to: string): Promise<FxResult | null> {
  if (from === to) return { convertedAmount: amount, rate: 1, from, to, date: null };
  try {
    const { data, error } = await supabase.functions.invoke("convert-currency", {
      body: { amount, from, to },
    });
    if (error || !data || data.error) return null;
    return data as FxResult;
  } catch {
    return null;
  }
}
