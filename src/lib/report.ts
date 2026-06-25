// Reportes de grupo (Pro). Genera, en el cliente, un resumen exportable de las
// cuentas de un grupo, filtrable por mes. Reutiliza el mismo cálculo de saldos
// y liquidación que la pestaña Balances (computeSettle / directTransfers).
//
// Salidas: datos estructurados (buildReport) para pintar la vista imprimible
// (→ PDF vía window.print) y un CSV (reportToCsv) para abrir en Excel/Sheets.
import type { Group, Expense, Settlement } from "./types";
import { computeSettle, directTransfers, type Transfer } from "./split";

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
  return { period, expenses, total, count, avg: count ? total / count : 0, paid, net, transfers, confirmed };
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
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  const cur = group.currency;
  const periodLabel = period === "all" ? t("report.allTime") : monthLabel(period, lang);
  const rows: string[] = [];

  rows.push(`SettliA — ${esc(group.name)} — ${esc(periodLabel)}`);
  rows.push("");
  rows.push([t("report.total"), n2(r.total), cur].map(esc).join(","));
  rows.push([t("report.count"), r.count].map(esc).join(","));
  rows.push([t("report.avg"), n2(r.avg), cur].map(esc).join(","));
  rows.push("");

  // Detalle de gastos
  rows.push(esc(t("report.expenses")));
  rows.push(
    [t("report.col.date"), t("report.col.concept"), t("report.col.category"), t("report.col.payer"), `${t("report.col.amount")} (${cur})`, t("report.col.participants")]
      .map(esc)
      .join(",")
  );
  for (const e of r.expenses) {
    const payer = e.payments?.length ? e.payments.map((p) => name(p.memberId)).join(" + ") : name(e.payerId);
    const parts = (e.participantIds.length ? e.participantIds : group.members.map((m) => m.id))
      .map(name)
      .join(" / ");
    rows.push([e.date, e.label, t(`cat.${e.category}`), payer, n2(e.amount), parts].map(esc).join(","));
  }
  rows.push("");

  // Saldos por persona
  rows.push(esc(t("report.balances")));
  rows.push([t("report.col.member"), `${t("report.col.paid")} (${cur})`, `${t("report.col.balance")} (${cur})`].map(esc).join(","));
  for (const m of group.members) {
    rows.push([m.name, n2(r.paid[m.id] || 0), n2(r.net[m.id] || 0)].map(esc).join(","));
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

/** Nombre de archivo seguro para el reporte. */
export function reportFilename(group: Group, period: Period, ext: string): string {
  const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "grupo";
  const p = period === "all" ? "historico" : period;
  return `settlia-${slug}-${p}.${ext}`;
}
