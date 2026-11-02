// Ventana nativa de "Valora esta app" de Apple (SKStoreReviewController).
// Solo en la app de iPhone. Apple decide si la muestra (máx. 3 veces al año).
import { registerPlugin } from "@capacitor/core";
import { isNativePlatform } from "./plan";

const StoreReview = registerPlugin<{ request(): Promise<void> }>("StoreReview");

export async function requestStoreReview(): Promise<void> {
  if (!isNativePlatform()) return;
  try { await StoreReview.request(); } catch {}
}
