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

/** Enlace de pago prerellenado (Modelo A+: destinatario + monto + moneda ya
 *  puestos), o null si el método no tiene enlace web (PayID, transferencia,
 *  Bizum → se usa `payTransferText` para copiar los datos listos para pegar en
 *  la app del banco). `currency` es el código ISO del grupo (EUR/USD/AUD…). */
export function payLink(pay: PayMethod | undefined, amount: number, currency?: string): string | null {
  if (!pay || !pay.value.trim()) return null;
  const a = (Math.round(amount * 100) / 100).toFixed(2);
  const u = encodeURIComponent(handle(pay.value));
  const cur = (currency ?? "").toUpperCase();
  switch (pay.type) {
    case "paypal":
      // paypal.me acepta el código de moneda pegado al monto (p. ej. /10.00EUR).
      return `https://paypal.me/${u}/${a}${cur}`;
    case "bunq":
      return `https://bunq.me/${u}/${a}`;
    case "wise":
      return `https://wise.com/pay/me/${u}`;
    case "revolut":
      // revolut.me acepta amount + currency como query.
      return cur
        ? `https://revolut.me/${u}?amount=${a}&currency=${cur}`
        : `https://revolut.me/${u}?amount=${a}`;
    case "other":
      return pay.value.startsWith("http") ? pay.value : null;
    case "payid":
    case "bank":
    case "bizum":
    default:
      return null;
  }
}

/** Concepto/referencia sugerido para la transferencia ("Settlia · {grupo}"). */
export function payConcept(groupName: string): string {
  const g = (groupName || "").trim();
  return g ? `Settlia · ${g}` : "Settlia";
}

/** Bloque de texto listo para pegar en la app del banco cuando el método NO
 *  tiene enlace web (PayID / transferencia / Bizum). Incluye a quién pagar, el
 *  dato de cobro, el monto y el concepto — el "Modelo A+" sin custodia: el
 *  dinero va banco a banco, nosotros solo pre-rellenamos los datos. */
export function payTransferText(
  pay: PayMethod,
  amount: number,
  currency: string,
  payeeName: string,
  concept: string,
): string {
  const a = (Math.round(amount * 100) / 100).toFixed(2);
  const cur = (currency ?? "").toUpperCase();
  const lines = [`${payeeName}`];
  if (pay.type === "bank") {
    if (pay.value?.trim()) lines.push(`BSB: ${pay.value.trim()}`);
    if (pay.value2?.trim()) lines.push(`Cuenta: ${pay.value2.trim()}`);
  } else {
    lines.push(pay.value.trim());
  }
  lines.push(`${a} ${cur}`.trim());
  if (concept) lines.push(concept);
  return lines.join("\n");
}
