// Reportes de grupo (Pro). Genera, en el cliente, un resumen exportable de las
// cuentas de un grupo, filtrable por mes. Reutiliza el mismo cálculo de saldos
// y liquidación que la pestaña Balances (computeSettle / directTransfers).
//
// Salidas: datos estructurados (buildReport) para pintar la vista imprimible
// (→ PDF vía window.print) y un CSV (reportToCsv) para abrir en Excel/Sheets.
import type { Group, Expense, Settlement } from "./types";
import { computeSettle, directTransfers, type Transfer } from "./split";
import { displayName } from "./format";

/** "all" = histórico completo; "YYYY-MM" = un mes concreto. */
export type Period = "all" | string;

type T = (key: string, params?: Record<string, string | number>) => string;

export function monthKey(iso: string): string {
  return (iso || "").slice(0, 7);
}

/** Meses (YYYY-MM) que tienen al menos un gasto, de más reciente a más antiguo. */
export function monthsWithExpenses(group: Group): string[] {
  const set = new Set<string>();
  for (const e of group.expenses) {
    const k = monthKey(e.date);
    if (k) set.add(k);
  }
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

/** Etiqueta legible de un mes ("junio de 2025" / "June 2025"). */
export function monthLabel(key: string, lang: "es" | "en"): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(lang === "en" ? "en-US" : "es-ES", {
    month: "long",
    year: "numeric",
  });
}

export interface ReportData {
  period: Period;
  expenses: Expense[]; // del periodo, ordenados por fecha ascendente
  total: number;
  count: number;
  avg: number;
  paid: Record<string, number>; // por memberId, dentro del periodo
  net: Record<string, number>;
  transfers: Transfer[];
  confirmed: Settlement[]; // pagos confirmados dentro del periodo
  /** Gasto por categoría (id → total), de mayor a menor. */
  byCategory: { id: string; value: number }[];
  /** Cuánto fronteó cada miembro (memberId → total), de mayor a menor. */
  byPayer: { id: string; value: number }[];
  topPayerId?: string; // quien puso dinero en más gastos
}

/** Calcula todos los datos del reporte para un periodo dado. */
export function buildReport(group: Group, period: Period): ReportData {
  const inP = (iso: string) => period === "all" || monthKey(iso) === period;
  const expenses = group.expenses
    .filter((e) => inP(e.date))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const settlements = (group.settlements ?? []).filter((s) => inP(s.date));
  const { paid, net, transfers: minT } = computeSettle(group.members, expenses, settlements);
  const transfers =
    group.simplifyDebts === false
      ? directTransfers(group.members, expenses, settlements)
      : minT;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const count = expenses.length;
  const confirmed = settlements.filter((s) => s.status === "confirmed");

  // Gasto por categoría (para el donut del reporte).
  const catTotals: Record<string, number> = {};
  for (const e of expenses) catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
  const byCategory = Object.entries(catTotals)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value);

  // Cuánto fronteó cada persona (multi-pagador incluido) + quién pagó más veces.
  const payerTotals: Record<string, number> = {};
  const payerCounts: Record<string, number> = {};
  for (const e of expenses) {
    const pays = e.payments?.length ? e.payments : [{ memberId: e.payerId, amount: e.amount }];
    for (const p of pays) {
      payerTotals[p.memberId] = (payerTotals[p.memberId] || 0) + Number(p.amount || 0);
      payerCounts[p.memberId] = (payerCounts[p.memberId] || 0) + 1;
    }
  }
  const byPayer = Object.entries(payerTotals)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value);
  const topPayerId = Object.entries(payerCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    period, expenses, total, count, avg: count ? total / count : 0,
    paid, net, transfers, confirmed, byCategory, byPayer, topPayerId,
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────
// Importes como número crudo (2 decimales, punto) para que las hojas de cálculo
// puedan operar; la moneda va en las cabeceras.

function esc(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const n2 = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

/** Genera el CSV (multi-sección) del reporte. */
export function reportToCsv(group: Group, period: Period, t: T, lang: "es" | "en"): string {
  const r = buildReport(group, period);
  const name = (id: string) => {
    const m = group.members.find((mm) => mm.id === id);
    return m ? displayName(m) : "?";
  };
  const cur = group.currency;
  const periodLabel = period === "all" ? t("report.allTime") : monthLabel(period, lang);
  const rows: string[] = [];

  rows.push(`Settlia — ${esc(group.name)} — ${esc(periodLabel)}`);
  rows.push("");
  rows.push([t("report.total"), n2(r.total), cur].map(esc).join(","));
  rows.push([t("report.count"), r.count].map(esc).join(","));
  rows.push([t("report.avg"), n2(r.avg), cur].map(esc).join(","));
  rows.push("");

  // Gasto por categoría
  if (r.byCategory.length > 0) {
    rows.push(esc(t("chart.byCategory")));
    rows.push([t("report.col.category"), `${t("report.col.amount")} (${cur})`, "%"].map(esc).join(","));
    for (const c of r.byCategory) {
      rows.push([t(`cat.${c.id}`), n2(c.value), r.total ? Math.round((c.value / r.total) * 100) : 0].map(esc).join(","));
    }
    rows.push("");
  }

  // Detalle de gastos
  rows.push(esc(t("report.expenses")));
  rows.push(
    [t("report.col.date"), t("report.col.concept"), t("report.col.category"), t("report.col.payer"), `${t("report.col.amount")} (${cur})`, t("report.col.participants"), t("report.receipts")]
      .map(esc)
      .join(",")
  );
  for (const e of r.expenses) {
    const payer = e.payments?.length ? e.payments.map((p) => name(p.memberId)).join(" + ") : name(e.payerId);
    const parts = (e.participantIds.length ? e.participantIds : group.members.map((m) => m.id))
      .map(name)
      .join(" / ");
    const hasReceipt = e.receiptPath ? t("common.yes") : t("common.no");
    rows.push([e.date, e.label, t(`cat.${e.category}`), payer, n2(e.amount), parts, hasReceipt].map(esc).join(","));
  }
  rows.push("");

  // Saldos por persona
  rows.push(esc(t("report.balances")));
  rows.push([t("report.col.member"), `${t("report.col.paid")} (${cur})`, `${t("report.col.balance")} (${cur})`].map(esc).join(","));
  for (const m of group.members) {
    rows.push([displayName(m), n2(r.paid[m.id] || 0), n2(r.net[m.id] || 0)].map(esc).join(","));
  }
  rows.push("");

  // Liquidación
  rows.push(esc(t("report.settlement")));
  rows.push([t("report.col.from"), t("report.col.to"), `${t("report.col.amount")} (${cur})`].map(esc).join(","));
  for (const tr of r.transfers) {
    rows.push([name(tr.from), name(tr.to), n2(tr.amount)].map(esc).join(","));
  }

  return rows.join("\n");
}

/** Descarga un texto como archivo (Blob + <a download>). */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type: mime }); // BOM → acentos correctos en Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo del reporte:
 *  "Settlia Report - {grupo} - {periodo} - {fecha generación}[.ext]".
 *  `periodLabel` ya viene localizado ("All time" / "julio de 2026"); `genDate`
 *  es la fecha ISO (YYYY-MM-DD) de cuando se generó. `ext` vacío → sin punto
 *  (para el <title> al imprimir a PDF, donde el navegador añade la extensión). */
export function reportFilename(group: Group, periodLabel: string, genDate: string, ext = ""): string {
  // Sanea caracteres ilegales en nombres de archivo (/ \ : * ? " < > |).
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const suffix = ext ? `.${ext}` : "";
  return `Settlia Report - ${clean(group.name)} - ${clean(periodLabel)} - ${genDate}${suffix}`;
}
