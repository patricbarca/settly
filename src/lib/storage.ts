// Almacenamiento de recibos/comprobantes en Supabase Storage (bucket privado
// `receipts`). La ruta es `{groupId}/{uid}.jpg`; el acceso (subir/leer) lo
// controla la RLS por membresía del grupo (ver migrate_v5). Solo guardamos la
// RUTA en el gasto; la imagen se ve con una URL firmada temporal.
import { supabase } from "./supabase";
import { fileToScanImage } from "./image";
import { uid } from "./format";

const BUCKET = "receipts";

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/** Sube una imagen (comprimida) al bucket de recibos. Devuelve la ruta guardada
 *  o null si falla (no debe bloquear el guardado del gasto). */
export async function uploadReceipt(groupId: string, file: File): Promise<string | null> {
  try {
    const { base64, mediaType } = await fileToScanImage(file);
    const blob = b64ToBlob(base64, mediaType);
    const path = `${groupId}/${uid()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mediaType,
      upsert: false,
    });
    if (error) {
      console.error("uploadReceipt", error);
      return null;
    }
    return path;
  } catch (e) {
    console.error("uploadReceipt", e);
    return null;
  }
}

/** URL firmada temporal (1 h) para ver un recibo. null si no se puede. */
export async function getReceiptUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) {
      console.error("getReceiptUrl", error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
