import { registerPlugin } from "@capacitor/core";
import { isNativePlatform } from "./plan";
import { isIOS } from "./pwa";
import type { Group } from "./types";
import { addExpense } from "./store";
import { parseMoney } from "./quickAdd";
import { knownMerchant, countryForCurrency } from "./merchants";
import { getLang } from "./i18n";

// Ajustes de "Preguntar por un pago" (automatización de Wallet). La acción
// nativa (ios/App/App/SettliaIntents.swift, PaymentPromptIntent) corre sin la
// web cargada, así que los ajustes viven en el App Group y la web los edita
// con el plugin WalletPrefs.

export interface MerchantRef { key: string; name: string }
export interface PaymentPrefs {
  minAmount: number;
  ignored: MerchantRef[];
  personal: MerchantRef[];
  notifications?: boolean;
}
interface QueueItem { id: string; merchant: string; amount: string; date: string }

const Plugin = registerPlugin<{
  get(): Promise<PaymentPrefs>;
  set(p: Partial<PaymentPrefs> & { lang?: string }): Promise<void>;
  takeQueue(): Promise<{ items: QueueItem[] }>;
}>("WalletPrefs");

export const walletPrefsAvailable = () => isNativePlatform() && isIOS();

export async function getPaymentPrefs(): Promise<PaymentPrefs | null> {
  if (!walletPrefsAvailable()) return null;
  try {
    return await Plugin.get();
  } catch {
    return null; // build viejo sin el plugin
  }
}

export async function setPaymentPrefs(p: Partial<PaymentPrefs>): Promise<void> {
  if (!walletPrefsAvailable()) return;
  try {
    await Plugin.set({ ...p, lang: getLang() });
  } catch {
    /* build viejo */
  }
}

/** Nombre legible del comercio: sin números de tienda ("WOOLWORTHS 2393" → "Woolworths"). */
function cleanMerchant(s: string): string {
  const t = s.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  return t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) || s;
}

/** Pagos de comercios marcados "Siempre a Personal": la acción nativa los deja
 *  en cola y aquí se apuntan en el grupo personal, sin preguntar. Ids estables
 *  (`wal_<uuid>`) para no duplicar si algo se reintenta. */
export async function drainPaymentQueue(groups: Group[]): Promise<number> {
  if (!walletPrefsAvailable()) return 0;
  const personal = groups.find((g) => g.personal);
  if (!personal) return 0; // se reintenta en la próxima apertura
  let items: QueueItem[] = [];
  try {
    items = (await Plugin.takeQueue()).items || [];
  } catch {
    return 0;
  }
  const have = new Set(personal.expenses.map((e) => e.id));
  const country = countryForCurrency(personal.currency);
  let n = 0;
  for (const it of items) {
    const amount = parseMoney(it.amount);
    const id = `wal_${it.id}`;
    if (!amount || have.has(id)) continue;
    const label = cleanMerchant(it.merchant || "Apple Pay");
    await addExpense(personal.id, {
      id,
      label,
      amount,
      payerId: personal.meId,
      participantIds: [personal.meId],
      splits: null,
      category: knownMerchant(it.merchant || "", country)?.category ?? "otros",
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : new Date().toLocaleDateString("en-CA"),
      createdBy: personal.meId,
    });
    n++;
  }
  return n;
}
