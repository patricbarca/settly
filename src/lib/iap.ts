// ============================================================
// Settlia – In-App Purchases (RevenueCat)
//
// Apple (guideline 3.1.1) y Google exigen que el contenido digital (Settlia Pro)
// se venda SOLO con la compra In-App nativa dentro del binario iOS/Android. Usamos
// RevenueCat (@revenuecat/purchases-capacitor) como capa sobre StoreKit / Play
// Billing: gestiona ofertas, compra, restauración y el entitlement "pro".
//
// TODO lo de este módulo está guardado con isNativePlatform(): en web no hace nada
// (la web sigue con Stripe / código de acceso). El entitlement "pro" de RevenueCat
// se refleja en plan.ts vía setNativePro().
//
// Configuración necesaria (fuera del código):
//   - App Store Connect: dos suscripciones auto-renovables en el grupo
//     "Settlia Pro": mensual $6.99 y anual $59.99.
//   - Google Play Console: los dos productos de suscripción equivalentes.
//   - RevenueCat: proyecto con un entitlement llamado "pro" ligado a esos
//     productos, y un "offering" por defecto con dos packages (mensual/anual).
//   - Claves API públicas de RevenueCat por plataforma en el entorno de build:
//     VITE_RC_IOS_KEY (appl_...) y VITE_RC_ANDROID_KEY (goog_...).
// ============================================================
import { Capacitor } from "@capacitor/core";
import { isNativePlatform, setNativePro } from "./plan";
import { supabase } from "./supabase";

/** Nombre del entitlement configurado en RevenueCat que desbloquea Pro. */
const ENTITLEMENT_ID = "pro";

const IOS_KEY = import.meta.env.VITE_RC_IOS_KEY as string | undefined;
const ANDROID_KEY = import.meta.env.VITE_RC_ANDROID_KEY as string | undefined;

let initialized = false;

/** Carga perezosa del plugin para que el bundle web no lo arrastre. */
async function rc() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod;
}

function apiKey(): string | undefined {
  return Capacitor.getPlatform() === "ios" ? IOS_KEY : ANDROID_KEY;
}

/** Inicializa RevenueCat e identifica al usuario (idempotente). Llamar al
 *  autenticar. No-op en web o si falta la clave. */
export async function initIAP(appUserId?: string): Promise<void> {
  if (!isNativePlatform()) return;
  const key = apiKey();
  if (!key) return;
  try {
    // Liga la compra al usuario de Supabase para que Pro le siga entre dispositivos.
    if (!appUserId) {
      const { data } = await supabase.auth.getUser();
      appUserId = data.user?.id;
    }
    const { Purchases, LOG_LEVEL } = await rc();
    if (!initialized) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
      await Purchases.configure({ apiKey: key, appUserID: appUserId });
      initialized = true;
    } else if (appUserId) {
      await Purchases.logIn({ appUserID: appUserId });
    }
    await syncEntitlement();
  } catch (e) {
    console.error("initIAP", e);
  }
}

/** Lee el CustomerInfo actual y refleja el entitlement "pro" en plan.ts. */
export async function syncEntitlement(): Promise<boolean> {
  if (!isNativePlatform() || !initialized) return false;
  try {
    const { Purchases } = await rc();
    const { customerInfo } = await Purchases.getCustomerInfo();
    const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    setNativePro(active);
    return active;
  } catch (e) {
    console.error("syncEntitlement", e);
    return false;
  }
}

export type IAPProduct = {
  id: string;
  billing: "monthly" | "annual";
  priceString: string; // ya localizado por la tienda, p. ej. "$6.99"
  packageIdentifier: string;
};

/** Devuelve los productos disponibles del offering por defecto (para el Paywall). */
export async function getProducts(): Promise<IAPProduct[]> {
  if (!isNativePlatform() || !initialized) return [];
  try {
    const { Purchases } = await rc();
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    const out: IAPProduct[] = [];
    for (const pkg of current.availablePackages) {
      const p = pkg.product;
      // RevenueCat marca los packages anuales/mensuales; deducimos por periodo.
      const type = pkg.packageType; // "ANNUAL" | "MONTHLY" | ...
      const billing: "monthly" | "annual" = type === "ANNUAL" ? "annual" : "monthly";
      out.push({
        id: p.identifier,
        billing,
        priceString: p.priceString,
        packageIdentifier: pkg.identifier,
      });
    }
    // mensual primero, anual después
    return out.sort((a, b) => (a.billing === "monthly" ? -1 : 1) - (b.billing === "monthly" ? -1 : 1));
  } catch (e) {
    console.error("getProducts", e);
    return [];
  }
}

export type PurchaseResult = { ok: boolean; cancelled?: boolean; error?: string };

/** Compra el package indicado (por su packageIdentifier del offering actual). */
export async function purchase(packageIdentifier: string): Promise<PurchaseResult> {
  if (!isNativePlatform() || !initialized) return { ok: false, error: "unavailable" };
  try {
    const { Purchases } = await rc();
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.identifier === packageIdentifier,
    );
    if (!pkg) return { ok: false, error: "no_package" };
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    setNativePro(active);
    return { ok: active };
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean; message?: string };
    if (err.userCancelled || err.code === "1" /* PURCHASE_CANCELLED */) {
      return { ok: false, cancelled: true };
    }
    console.error("purchase", e);
    return { ok: false, error: err.message ?? "purchase_failed" };
  }
}

/** Restaura compras previas (obligatorio para Apple). Devuelve si quedó Pro. */
export async function restore(): Promise<boolean> {
  if (!isNativePlatform() || !initialized) return false;
  try {
    const { Purchases } = await rc();
    const { customerInfo } = await Purchases.restorePurchases();
    const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    setNativePro(active);
    return active;
  } catch (e) {
    console.error("restore", e);
    return false;
  }
}
