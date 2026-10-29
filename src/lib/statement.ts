// Importar un estado de cuenta: el texto se extrae EN EL DISPOSITIVO (CSV tal
// cual, PDF con pdf.js); solo el texto va a la IA (`parse-statement`), nunca el
// archivo. El usuario revisa los movimientos antes de guardarlos.
import { supabase } from "./supabase";
import { requestAIConsent, AIConsentDeclined } from "./aiConsent";
import type { Category, Expense } from "./types";

export interface StatementTx {
  key: string; // id estable del movimiento (para no duplicar al reimportar)
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  category: Category | string;
}

const CHUNK = 12_000;

/** Texto plano del archivo. PDF: líneas reconstruidas por posición vertical. */
export async function statementText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const it of content.items as { str: string; transform: number[] }[]) {
        if (!it.str?.trim()) continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        const row = rows.get(y) ?? [];
        row.push({ x: it.transform[4], s: it.str });
        rows.set(y, row);
      }
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, r]) => r.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join("  "));
      pages.push(lines.join("\n"));
    }
    return pages.join("\n");
  }
  return await file.text();
}

/** Trozos de texto que caben en una llamada, cortando por líneas. */
export function chunkText(text: string, size = CHUNK): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split(/\r?\n/)) {
    if (cur.length + line.length + 1 > size && cur) { out.push(cur); cur = ""; }
    cur += line.slice(0, size) + "\n";
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function parseStatement(text: string, categories: string[], labels: Record<string, string>): Promise<StatementTx[]> {
  if (!(await requestAIConsent())) throw new AIConsentDeclined();
  const year = new Date().getFullYear();
  const all: StatementTx[] = [];
  const seen = new Map<string, number>();
  for (const chunk of chunkText(text).slice(0, 8)) {
    const { data, error } = await supabase.functions.invoke("parse-statement", { body: { text: chunk, categories, labels, year } });
    if (error) throw error;
    const res = data as { transactions?: Omit<StatementTx, "key">[]; error?: string };
    if (!res || res.error) throw new Error(res?.error || "statement_failed");
    for (const t of res.transactions ?? []) {
      // Dos movimientos idénticos el mismo día son posibles (dos cafés): se
      // numeran para que tengan claves distintas.
      const base = `${t.date}|${t.description.toLowerCase()}|${t.amount}|${t.type}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      all.push({ ...t, key: `stm_${hash(base)}_${n}` });
    }
  }
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** ¿Ya existe este gasto? Mismo importe (±0,01) y fecha a ≤2 días, o el mismo id. */
export function findDuplicate(tx: StatementTx, expenses: Expense[]): Expense | undefined {
  const t = Date.parse(tx.date);
  return expenses.find(
    (e) =>
      e.id === tx.key ||
      (Math.abs(e.amount - tx.amount) < 0.011 && Math.abs(Date.parse(e.date) - t) <= 2 * 86400000),
  );
}
