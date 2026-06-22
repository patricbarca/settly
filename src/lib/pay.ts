import type { PayMethod, PayType } from "./types";

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
