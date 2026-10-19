import type { Group, SplitMode } from "./types";

/** Reparto por defecto del grupo, limpio: solo miembros actuales con valor > 0. */
export function cleanDefault(group: Group): { mode: "percent" | "shares"; values: Record<string, number> } | null {
  const ds = group.defaultSplit;
  if (!ds || (ds.mode !== "percent" && ds.mode !== "shares")) return null;
  const ids = new Set(group.members.map((m) => m.id));
  const values: Record<string, number> = {};
  for (const [id, v] of Object.entries(ds.values || {})) {
    const n = Number(v);
    if (ids.has(id) && Number.isFinite(n) && n > 0) values[id] = n;
  }
  return Object.keys(values).length ? { mode: ds.mode, values } : null;
}

/** Valores del reparto por defecto para una lista concreta de participantes.
 *  En % se reescalan a 100 entre los elegidos (60/40 entre 3 con uno fuera
 *  sigue manteniendo la proporción). Devuelve null si algún elegido no tiene
 *  valor en el reparto por defecto (entonces se usa el reparto normal). */
export function defaultValuesFor(group: Group, mode: SplitMode, ids: string[]): Record<string, number> | null {
  const ds = cleanDefault(group);
  if (!ds || ds.mode !== mode || !ids.length || ids.some((id) => !ds.values[id])) return null;
  if (mode === "shares") return Object.fromEntries(ids.map((id) => [id, ds.values[id]]));
  const sum = ids.reduce((a, id) => a + ds.values[id], 0);
  const out: Record<string, number> = {};
  let acc = 0;
  ids.forEach((id, i) => {
    const v = i === ids.length - 1 ? Math.round((100 - acc) * 100) / 100 : Math.round((ds.values[id] / sum) * 10000) / 100;
    out[id] = v;
    acc += v;
  });
  return out;
}

/** Reparto inicial de un gasto nuevo. Si los participantes son "todos" (lo que
 *  se pone cuando nadie dijo otra cosa) o justo los del reparto por defecto,
 *  se aplica el reparto por defecto; si no, a partes iguales. */
export function initialSplit(
  group: Group,
  participantIds?: string[]
): { participantIds: string[]; splitMode: SplitMode; splitValues: Record<string, number> } {
  const all = group.members.map((m) => m.id);
  const ids = participantIds && participantIds.length ? participantIds : all;
  const ds = cleanDefault(group);
  if (ds) {
    const dsIds = all.filter((id) => ds.values[id]);
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    if (same(ids, all) || same(ids, dsIds)) {
      const vals = defaultValuesFor(group, ds.mode, dsIds);
      if (vals) return { participantIds: dsIds, splitMode: ds.mode, splitValues: vals };
    }
  }
  return { participantIds: ids, splitMode: "equal", splitValues: {} };
}
