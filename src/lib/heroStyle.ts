import type { CSSProperties } from "react";
import type { Group } from "./types";

/** Colores para la tarjeta del grupo. `default` = el degradado violeta de siempre. */
export const HERO_COLORS: { id: string; a: string; b: string }[] = [
  { id: "default", a: "#5B5BF0", b: "#15b3b0" },
  { id: "teal", a: "#0FA3A3", b: "#0b5f6b" },
  { id: "ocean", a: "#0EA5E9", b: "#1e3a8a" },
  { id: "coral", a: "#FF5A4D", b: "#9d1d48" },
  { id: "amber", a: "#E8920C", b: "#9a3412" },
  { id: "green", a: "#22a45d", b: "#14532d" },
  { id: "pink", a: "#e0479e", b: "#5b21b6" },
  { id: "slate", a: "#475569", b: "#0f172a" },
];

export function heroColor(id?: string) {
  return HERO_COLORS.find((c) => c.id === id);
}

/** Estilo de fondo de la tarjeta; `undefined` = usar el CSS `.hero` por defecto. */
export function heroBackground(g: Pick<Group, "heroColor" | "heroImage">): CSSProperties | undefined {
  if (g.heroImage)
    return {
      backgroundImage: `linear-gradient(180deg, rgba(10,14,30,.55), rgba(10,14,30,.35) 45%, rgba(10,14,30,.7)), url(${g.heroImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  const c = heroColor(g.heroColor);
  if (!c || c.id === "default") return undefined;
  return {
    backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${c.a}cc, transparent 60%), linear-gradient(150deg, ${c.a}, ${c.b})`,
  };
}
