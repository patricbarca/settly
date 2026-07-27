import type { PayMethod, PayType } from "./types";
import { supabase } from "./supabase";

// Orden de los métodos en la UI (etiquetas y placeholders viven en i18n).
export const PAY_TYPES: PayType[] = [
  "payid",
  "bank",
  "paypal",
  "revolut",
  "wise",
  "bizum",
  "bunq",
  "other",
];

/** Métodos de pago de un miembro (nuevo modelo `pays` con compat. al antiguo
 *  `pay`). Devuelve solo los que tienen valor. */
export function memberPays(m?: { pays?: PayMethod[]; pay?: PayMethod } | null): PayMethod[] {
  const list = m?.pays ?? (m?.pay ? [m.pay] : []);
  return list.filter((p) => p && p.value && p.value.trim());
}

/** Métodos de pago de un miembro leídos desde su PERFIL (fallback cuando el
 *  registro del miembro en el grupo no los tiene sincronizados — p.ej. el
 *  usuario configuró sus métodos antes de unirse al grupo o desde otro
 *  dispositivo, y su cliente nunca reescribió el `members[]` de ESTE grupo).
 *  Enlaza member_id → user_id vía `group_members` y lee `profiles.pays`.
 *  Requiere la RLS `View co-members` (migrate_v4) para leer la fila del otro
 *  miembro. Devuelve [] ante cualquier fallo (offline, sin permiso, etc.). */
export async function fetchMemberProfilePays(groupId: string, memberId: string): Promise<PayMethod[]> {
  try {
    const { data: gm } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("member_id", memberId)
      .maybeSingle();
    const userId = (gm as { user_id?: string } | null)?.user_id;
    if (!userId) return [];
    const { data: prof } = await supabase
      .from("profiles")
      .select("pays")
      .eq("id", userId)
      .maybeSingle();
    const list = Array.isArray((prof as { pays?: PayMethod[] } | null)?.pays)
      ? ((prof as { pays: PayMethod[] }).pays)
      : [];
    return list.filter((p) => p && p.value && p.value.trim());
  } catch {
    return [];
  }
}

// si pegan una URL completa, nos quedamos con el último segmento (el usuario)
function handle(v: string): string {
  return v.replace(/\/+$/, "").split("/").pop()!.trim();
}

/** Texto del método para copiar/mostrar (incluye el 2º campo en
 *  transferencias: BSB + nº de cuenta). */
export function payClipboardText(pay: PayMethod): string {
  if (pay.type === "bank") {
    return [pay.value, pay.value2].map((v) => v?.trim()).filter(Boolean).join(" / ");
  }
  return pay.value.trim();
}

/** Enlace de pago prerellenado, o null si el método no tiene enlace web
 *  (PayID, transferencia, Bizum → se copia el dato y se pega en la app del banco). */
export function payLink(pay: PayMethod | undefined, amount: number): string | null {
  if (!pay || !pay.value.trim()) return null;
  const a = (Math.round(amount * 100) / 100).toFixed(2);
  const u = encodeURIComponent(handle(pay.value));
  switch (pay.type) {
    case "paypal":
      return `https://paypal.me/${u}/${a}`;
    case "bunq":
      return `https://bunq.me/${u}/${a}`;
    case "wise":
      return `https://wise.com/pay/me/${u}`;
    case "revolut":
      return `https://revolut.me/${u}`;
    case "other":
      return pay.value.startsWith("http") ? pay.value : null;
    case "payid":
    case "bank":
    case "bizum":
    default:
      return null;
  }
}
