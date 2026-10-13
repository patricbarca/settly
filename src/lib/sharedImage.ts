import { registerPlugin } from "@capacitor/core";
import { isNativePlatform } from "./plan";

// Imagen que llega de "Compartir con Settlia" (ios/App/ShareExtension). La
// extensión la deja en un portapapeles privado y abre `://scan?shared=1`; el
// plugin nativo SharedImage (ios/App/App/SharedImagePlugin.swift) la entrega
// UNA vez y la borra.
const SharedImage = registerPlugin<{ take(): Promise<{ dataUrl?: string }> }>("SharedImage");

/** La imagen compartida como File, o null si no hay (o no estamos en iOS). */
export async function takeSharedImage(): Promise<File | null> {
  if (!isNativePlatform()) return null;
  try {
    const { dataUrl } = await SharedImage.take();
    if (!dataUrl) return null;
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], "shared.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}
