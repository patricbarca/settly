import { supabase } from "./supabase";

/** Formatea una tasa de cambio con suficientes decimales para que se vea
 *  con sentido incluso en pares muy desbalanceados (p. ej. 1 VND ≈ 0.000055
 *  AUD — con 4 decimales fijos redondearía a "0.0001"). */
export function fmtRate(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const decimals = Math.min(10, Math.max(4, -Math.floor(Math.log10(Math.abs(n))) + 2));
  return n.toFixed(decimals);
}

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
