import { currencyOf } from "./currencies";

const PALETTE = ["#6E8B3A", "#FF5A4D", "#5B5BF0", "#E8920C", "#E84393", "#0EA5E9"];

export function money(n: number, code = "EUR"): string {
  const c = currencyOf(code);
  const dec = c.decimals ?? 2;
  const f = Math.pow(10, dec);
  const v = Math.round((Number(n) + Number.EPSILON) * f) / f;
  const hasFrac = dec > 0 && Math.abs(v % 1) > 1 / (f * 10);
  const num = v.toLocaleString("es-ES", {
    minimumFractionDigits: hasFrac ? dec : 0,
    maximumFractionDigits: dec,
  });
  const sp = /[A-Za-z]$/.test(c.symbol) ? " " : "";
  return `${c.symbol}${sp}${num}`;
}

export function personColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Iniciales de un miembro: usa las personalizadas si las tiene; si no, las
 *  deriva del nombre. */
export function memberInitials(m: { initials?: string; name: string }): string {
  const custom = m.initials?.trim();
  return custom ? custom.slice(0, 3).toUpperCase() : initials(m.name);
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}
