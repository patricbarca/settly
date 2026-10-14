import type { Category, Expense, Settlement } from "./types";

// Importa el CSV que exporta Splitwise ("Export as spreadsheet").
//
// Formato: Date, Description, Category, Cost, Currency y UNA COLUMNA POR
// PERSONA con su saldo neto en esa fila (positivo = puso más de lo que le
// tocaba; negativo = le tocaba más de lo que puso). Las filas con categoría
// "Payment" son pagos entre dos personas; la última fila "Total balance" es el
// saldo final y solo se usa para comprobar.
//
// El CSV no trae quién pagó ni el reparto por separado, solo el neto. Con UN
// pagador se reconstruye exacto: su parte = coste − su neto; la de los demás =
// −neto. Con varios pagadores no se puede saber cuánto puso cada uno, así que
// se reparte el resto a partes iguales entre ellos y la fila se marca `guessed`.

export type SwRow = {
  date: string;
  description: string;
  category: string;
  cost: number;
  currency: string;
  nets: number[]; // mismo orden que `people`
};

export type SwParsed = {
  people: string[];
  expenses: SwRow[];
  payments: SwRow[];
  /** Saldo final por persona según Splitwise (fila "Total balance"), si viene. */
  totals: Record<string, number[]>; // por moneda
  currencies: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Parser CSV mínimo con comillas ("a,b" y "" escapado). */
function csvRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ""));
}

const num = (v: string) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseSplitwiseCsv(text: string): SwParsed {
  const rows = csvRows(text);
  const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const iDate = head.indexOf("date");
  const iDesc = head.indexOf("description");
  const iCat = head.indexOf("category");
  const iCost = head.indexOf("cost");
  const iCur = head.indexOf("currency");
  if ([iDate, iDesc, iCat, iCost, iCur].some((i) => i < 0)) throw new Error("not-splitwise");
  const first = Math.max(iDate, iDesc, iCat, iCost, iCur) + 1;
  const people = rows[0].slice(first).map((p) => p.trim()).filter(Boolean);
  if (!people.length) throw new Error("not-splitwise");

  const expenses: SwRow[] = [];
  const payments: SwRow[] = [];
  const totals: Record<string, number[]> = {};
  for (const r of rows.slice(1)) {
    const description = (r[iDesc] ?? "").trim();
    const currency = (r[iCur] ?? "").trim().toUpperCase();
    const nets = people.map((_, k) => r2(num(r[first + k] ?? "0")));
    if (/^total balance$/i.test(description)) {
      if (currency) totals[currency] = nets;
      continue;
    }
    const cost = r2(num(r[iCost] ?? "0"));
    if (!currency || cost <= 0) continue;
    const row: SwRow = {
      date: (r[iDate] ?? "").trim().slice(0, 10),
      description: description || "Splitwise",
      category: (r[iCat] ?? "").trim(),
      cost,
      currency,
      nets,
    };
    if (/^payment$/i.test(row.category)) payments.push(row);
    else expenses.push(row);
  }
  const currencies = [...new Set([...expenses, ...payments].map((x) => x.currency))];
  return { people, expenses, payments, totals, currencies };
}

/** Categoría de Splitwise → categoría de Settlia. */
export function mapCategory(sw: string): Category {
  const c = sw.toLowerCase();
  const has = (...k: string[]) => k.some((x) => c.includes(x));
  if (has("dining", "food")) return "comida";
  if (has("grocer")) return "mercado";
  if (has("liquor", "alcohol")) return "bebidas";
  if (has("taxi", "parking", "fuel", "gas/", "bus", "train", "car", "bicycle")) return "transporte";
  if (has("plane", "flight")) return "viajes";
  if (has("hotel", "rent", "mortgage")) return "alojamiento";
  if (has("entertainment", "games", "movies", "music", "sports")) return "ocio";
  if (has("clothing", "household", "electronics", "furniture", "pets", "maintenance")) return "compras";
  if (has("medical", "health")) return "salud";
  if (has("electric", "heat", "water", "tv", "internet", "utilit", "cleaning", "trash", "phone")) return "servicios";
  if (has("insurance")) return "seguros";
  if (has("gift")) return "regalos";
  return "otros";
}

/** Id estable por fila: reimportar el mismo CSV no duplica (mismo id → el
 *  servidor lo une por id). `n` distingue filas idénticas. */
function stableId(prefix: string, r: SwRow, n: number) {
  const s = `${r.date}|${r.description}|${r.cost}|${r.currency}|${r.nets.join(",")}|${n}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${prefix}${h.toString(36)}`;
}

/** Reparte `cents` para que la suma de las partes sea EXACTA (el céntimo
 *  suelto va a la parte mayor). */
function fixRounding(map: Record<string, number>, total: number) {
  const keys = Object.keys(map);
  if (!keys.length) return map;
  const diff = r2(total - keys.reduce((s, k) => s + map[k], 0));
  if (Math.abs(diff) >= 0.005) {
    const big = keys.reduce((a, b) => (map[a] >= map[b] ? a : b));
    map[big] = r2(map[big] + diff);
  }
  return map;
}

export type BuiltImport = {
  expenses: (Expense & { guessed?: boolean })[];
  settlements: Settlement[];
  guessed: number;
};

/**
 * Convierte las filas a gastos/pagos de Settlia.
 * `memberOf[k]` = memberId del grupo para la persona `people[k]`.
 * Un gasto en moneda distinta de la del grupo se guarda con `currency` propia.
 */
export function buildImport(p: SwParsed, memberOf: string[], groupCurrency: string, createdBy: string): BuiltImport {
  const seen = new Map<string, number>();
  const nth = (r: SwRow) => {
    const k = `${r.date}|${r.description}|${r.cost}|${r.currency}|${r.nets.join(",")}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n;
  };
  const cur = (c: string) => (c === groupCurrency ? undefined : c);
  let guessed = 0;

  const expenses = p.expenses.map((r) => {
    // Neto por miembro (dos personas del CSV pueden ir al mismo miembro).
    const net: Record<string, number> = {};
    r.nets.forEach((v, k) => {
      if (Math.abs(v) < 0.005) return;
      const m = memberOf[k];
      net[m] = r2((net[m] ?? 0) + v);
    });
    const payers = Object.keys(net).filter((m) => net[m] > 0.005);
    const owers = Object.keys(net).filter((m) => net[m] < -0.005);
    const share: Record<string, number> = {};
    for (const m of owers) share[m] = r2(-net[m]);
    const rest = r2(r.cost - owers.reduce((s, m) => s + share[m], 0));
    let isGuess = false;
    if (payers.length === 1) {
      if (rest > 0.005) share[payers[0]] = rest;
    } else if (payers.length > 1) {
      isGuess = true;
      const each = r2(rest / payers.length);
      for (const m of payers) if (each > 0.005) share[m] = each;
    }
    fixRounding(share, r.cost);
    if (isGuess) guessed++;
    const participantIds = Object.keys(share);
    const payments =
      payers.length > 1
        ? fixRounding(Object.fromEntries(payers.map((m) => [m, r2(net[m] + (share[m] ?? 0))])), r.cost)
        : null;
    const e: Expense & { guessed?: boolean } = {
      id: stableId("sw_", r, nth(r)),
      label: r.description,
      amount: r.cost,
      payerId: payers[0] ?? participantIds[0] ?? createdBy,
      participantIds,
      splits: share,
      payments: payments ? Object.entries(payments).map(([memberId, amount]) => ({ memberId, amount })) : null,
      category: mapCategory(r.category),
      date: r.date,
      createdBy,
      note: "Splitwise",
      ...(cur(r.currency) ? { currency: cur(r.currency) } : {}),
      ...(isGuess ? { guessed: true } : {}),
    };
    return e;
  });

  const settlements: Settlement[] = [];
  for (const r of p.payments) {
    // Quien pagó queda en positivo; quien cobró, en negativo.
    const k = r.nets.findIndex((v) => v > 0.005);
    const j = r.nets.findIndex((v) => v < -0.005);
    if (k < 0 || j < 0) continue;
    const from = memberOf[k];
    const to = memberOf[j];
    if (from === to) continue;
    settlements.push({
      id: stableId("swp_", r, nth(r)),
      from,
      to,
      amount: r.cost,
      date: r.date,
      status: "confirmed",
      ...(cur(r.currency) ? { currency: cur(r.currency) } : {}),
    } as Settlement);
  }
  return { expenses, settlements, guessed };
}

/** Neto final por persona y moneda según las filas (para cuadrar con el total
 *  que trae el propio CSV). */
export function csvNetTotals(p: SwParsed): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of [...p.expenses, ...p.payments]) {
    const t = (out[r.currency] ??= p.people.map(() => 0));
    r.nets.forEach((v, k) => (t[k] = r2(t[k] + v)));
  }
  return out;
}
