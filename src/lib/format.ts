import { currencyOf } from "./currencies";
import { getLang } from "./i18n";

const PALETTE = ["#0FA3A3", "#FF5A4D", "#5B5BF0", "#E8920C", "#E84393", "#0EA5E9"];

export function money(n: number, code = "EUR"): string {
  const c = currencyOf(code);
  const dec = c.decimals ?? 2;
  const f = Math.pow(10, dec);
  const v = Math.round((Number(n) + Number.EPSILON) * f) / f;
  const hasFrac = dec > 0 && Math.abs(v % 1) > 1 / (f * 10);
  // El separador decimal sigue el idioma de la app (antes forzado a "es-ES",
  // lo que mostraba comas incluso en inglés/USD y confundía los montos).
  const locale = getLang() === "en" ? "en-US" : "es-ES";
  const num = v.toLocaleString(locale, {
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

/** Miembros ordenados alfabéticamente por nombre (case/acento-insensible),
 *  para que aparezcan siempre en el mismo orden en toda la app en vez del
 *  orden de alta (creador primero, luego quien se fue añadiendo). */
export function sortedMembers<T extends { name: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Etiquetas de iniciales ÚNICAS dentro de un grupo, cada una con un color
 *  distinto, para que nunca haya dos personas indistinguibles en los avatares.
 *  - Respeta las iniciales personalizadas (`Member.initials`).
 *  - Si dos personas comparten las iniciales derivadas del nombre, las alarga
 *    con más letras del nombre (Patric→"PA", Paula→"PAU") hasta diferenciarlas.
 *  - Si los nombres son idénticos (dos "Patrick"), salen prefijos de distinta
 *    longitud ("PA"/"PAT") y, como último recurso, un sufijo numérico; además
 *    el color garantizado distinto los separa visualmente. */
export function memberLabels(
  members: { id: string; initials?: string; name: string }[]
): Record<string, { label: string; color: string }> {
  const out: Record<string, { label: string; color: string }> = {};
  const base: Record<string, string> = {};
  for (const m of members) base[m.id] = memberInitials(m);

  const counts: Record<string, number> = {};
  for (const id in base) counts[base[id]] = (counts[base[id]] ?? 0) + 1;

  // 1) Iniciales únicas. Primero reservamos las que ya son únicas o las
  //    personalizadas (no se tocan); luego alargamos las que colisionan.
  const usedLabels = new Set<string>();
  for (const m of members) {
    if (counts[base[m.id]] === 1 || m.initials?.trim()) {
      out[m.id] = { label: base[m.id], color: "" };
      usedLabels.add(base[m.id]);
    }
  }
  for (const m of members) {
    if (out[m.id]) continue;
    const clean = m.name.replace(/\s+/g, "");
    let label = base[m.id];
    for (let n = 2; n <= clean.length; n++) {
      label = clean.slice(0, n).toUpperCase();
      if (!usedLabels.has(label)) break;
    }
    // Nombres idénticos / sin más letras → sufijo numérico.
    if (usedLabels.has(label)) {
      const root = label;
      let i = 2;
      while (usedLabels.has(label)) label = root + i++;
    }
    out[m.id] = { label, color: "" };
    usedLabels.add(label);
  }

  // 2) Color distinto dentro del grupo (con >6 miembros se permite repetir).
  const usedColors = new Set<string>();
  for (const m of members) {
    let color = personColor(m.name);
    if (usedColors.has(color)) color = PALETTE.find((c) => !usedColors.has(c)) ?? color;
    usedColors.add(color);
    out[m.id].color = color;
  }
  return out;
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}
