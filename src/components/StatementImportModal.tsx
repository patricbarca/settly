import { useMemo, useRef, useState } from "react";
import { useT, useLang } from "../lib/i18n";
import { CATEGORIES, type Category, type Group } from "../lib/types";
import { addExpense, useGroups } from "../lib/store";
import { consumeAI } from "../lib/plan";
import { categoryColor, fmtDate, money } from "../lib/format";
import { CURRENCIES, resolveToCode } from "../lib/currencies";
import { statementText, parseStatement, findDuplicate, findInGroups, type StatementTx } from "../lib/statement";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";

const KNOWN = new Set(CATEGORIES.map((c) => c.id as string));
/** Transferencias (a otra cuenta tuya, a otro banco…): no suelen ser gasto. */
const isTransfer = (d: string) => /\b(transfer|trf|tfr|bpay to self|internal|transferencia|traspaso)\b/i.test(d);

/** "Importar estado de cuenta" (Pro): CSV o PDF del banco → la IA saca los
 *  movimientos → el usuario elige cuáles van a su grupo Personal. Los cargos
 *  entran marcados; los abonos (ingresos, devoluciones) y los que parecen ya
 *  apuntados entran desmarcados. */
export function StatementImportModal({ personal, onClose }: { personal: Group; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const catName = (c: string) => (KNOWN.has(c) ? t(`cat.${c}`) : c);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "busy" | "review" | "saving" | "done">("pick");
  const [err, setErr] = useState<string | null>(null);
  const [txs, setTxs] = useState<StatementTx[]>([]);
  const [sel, setSel] = useState<Record<string, { on: boolean; cat: string }>>({});
  const [currency, setCurrency] = useState(() => resolveToCode(personal.currency));
  const [saved, setSaved] = useState(0);
  const [fileName, setFileName] = useState("");
  const groups = useGroups();
  const inGroup = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const x of txs) if (x.type === "debit") m.set(x.key, findInGroups(x, groups));
    return m;
  }, [txs, groups]);

  const dupes = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const x of txs) m.set(x.key, !!findDuplicate(x, personal.expenses));
    return m;
  }, [txs, personal.expenses]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name.replace(/\.(pdf|csv|txt)$/i, ""));
    setErr(null);
    if (f.size > 8 * 1024 * 1024) { setErr(t("stmt.tooBig")); return; }
    if (!consumeAI("text")) { setErr(t("proj.aiQuota")); return; }
    setPhase("busy");
    try {
      const text = await statementText(f);
      if (text.replace(/\s/g, "").length < 20) throw new Error("empty");
      const res = await parseStatement(text, CATEGORIES.map((c) => c.id), Object.fromEntries(CATEGORIES.map((c) => [c.id, catName(c.id)])));
      if (!res.length) { setPhase("pick"); setErr(t("stmt.none")); return; }
      const s: Record<string, { on: boolean; cat: string }> = {};
      for (const x of res) s[x.key] = { on: x.type === "debit" && !isTransfer(x.description) && !findDuplicate(x, personal.expenses) && !findInGroups(x, groups), cat: x.category };
      setTxs(res);
      setSel(s);
      setPhase("review");
    } catch (e) {
      setPhase("pick");
      if ((e as Error)?.name !== "AIConsentDeclined") setErr(t("stmt.error"));
    }
  }

  async function save() {
    setPhase("saving");
    const groupCode = resolveToCode(personal.currency);
    const picked = txs.filter((x) => sel[x.key]?.on);
    const statementId = "st_" + Date.now().toString(36);
    const importedAt = new Date().toISOString();
    const jobs = picked.map((x) => () =>
      addExpense(personal.id, {
        id: x.key,
        label: x.description,
        amount: x.amount,
        payerId: personal.meId,
        participantIds: [personal.meId],
        splits: null,
        category: (sel[x.key]?.cat || "otros") as Category,
        date: x.date,
        createdBy: personal.meId,
        aiReviewed: true,
        inbox: true,
        source: "statement",
        statementId,
        statementName: fileName || t("stmt.title"),
        importedAt,
        ...(currency !== groupCode ? { currency } : {}),
      }),
    );
    for (let k = 0; k < jobs.length; k += 6) await Promise.all(jobs.slice(k, k + 6).map((f) => f()));
    setSaved(picked.length);
    setPhase("done");
  }

  const on = txs.filter((x) => sel[x.key]?.on);
  const total = on.reduce((s, x) => s + x.amount, 0);
  const allOn = txs.length > 0 && on.length === txs.length;

  return (
    <Overlay onClose={phase === "saving" || phase === "busy" ? () => {} : onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 anim-pop max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold inline-flex items-center gap-2"><Icon name="doc" size={18} /> {t("stmt.title")}</h3>
          {phase !== "saving" && phase !== "busy" && (
            <button onClick={onClose} className="glass rounded-full p-1.5" aria-label={t("common.close")}><Icon name="close" size={16} /></button>
          )}
        </div>

        {phase === "pick" && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">{t("stmt.intro")}</p>
            <ul className="text-xs text-muted space-y-1 pl-1">
              <li>• {t("stmt.how1")}</li>
              <li>• {t("stmt.how2")}</li>
              <li>• {t("stmt.privacy")}</li>
            </ul>
            <div>
              <label className="text-xs font-semibold text-muted">{t("stmt.currency")}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="glass rounded-xl px-3 py-2 text-sm w-full min-w-0 mt-1">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
              </select>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-2xl py-3 text-sm font-semibold text-white inline-flex items-center justify-center gap-2" style={{ background: "var(--teal)" }}>
              <Icon name="doc" size={16} /> {t("stmt.pick")}
            </button>
            {err && <p className="text-xs" style={{ color: "var(--coral)" }}>{err}</p>}
          </div>
        )}

        {phase === "busy" && (
          <div className="py-10 text-center text-sm text-muted animate-pulse">
            <Icon name="sparkles" size={22} className="mx-auto mb-2" style={{ color: "var(--teal)" }} />
            {t("stmt.reading")}
          </div>
        )}

        {phase === "review" && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted mb-2">
              <span>{t("stmt.found", { n: txs.length })}</span>
              <button className="font-semibold" style={{ color: "var(--teal)" }} onClick={() => setSel((s) => Object.fromEntries(txs.map((x) => [x.key, { ...s[x.key], on: !allOn }])))}>
                {allOn ? t("pay.deselectAll") : t("pay.selectAll")}
              </button>
            </div>
            <div className="space-y-1.5">
              {txs.map((x) => {
                const s = sel[x.key] ?? { on: false, cat: x.category };
                const dup = dupes.get(x.key);
                return (
                  <div key={x.key} className={`glass rounded-2xl p-2.5 flex items-start gap-2.5 ${s.on ? "" : "opacity-60"}`}>
                    <input type="checkbox" checked={s.on} onChange={() => setSel((p) => ({ ...p, [x.key]: { ...s, on: !s.on } }))} className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium truncate min-w-0">{x.description}</span>
                        <span className="text-sm font-mono shrink-0" style={x.type === "credit" ? { color: "#16a34a" } : undefined}>
                          {x.type === "credit" ? "+" : ""}{money(x.amount, currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[11px] text-muted">{fmtDate(x.date)}</span>
                        {x.type === "credit" && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "rgba(22,163,74,.15)", color: "#16a34a" }}>{t("stmt.credit")}</span>}
                        {isTransfer(x.description) && x.type === "debit" && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "rgba(91,91,240,.15)", color: "var(--indigo)" }}>{t("stmt.transfer")}</span>}
                        {inGroup.get(x.key) && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 truncate max-w-[60%]" style={{ background: "rgba(232,146,12,.15)", color: "var(--amber)" }}>⚠ {t("stmt.inGroup", { g: inGroup.get(x.key)! })}</span>}
                        {dup && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "rgba(232,146,12,.15)", color: "var(--amber)" }}>{t("stmt.dup")}</span>}
                        <select
                          value={s.cat}
                          onChange={(e) => setSel((p) => ({ ...p, [x.key]: { ...s, cat: e.target.value } }))}
                          className="glass rounded-lg px-1.5 py-0.5 text-[11px] min-w-0 ml-auto"
                          style={{ color: categoryColor(s.cat as Category) }}
                        >
                          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{catName(c.id)}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sticky bottom-0 pt-3 mt-2" style={{ background: "linear-gradient(transparent, var(--glass-strong-solid) 30%)" }}>
              <button disabled={!on.length} onClick={save} className="w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--teal)" }}>
                {t("stmt.save", { n: on.length, total: money(total, currency) })}
              </button>
            </div>
          </div>
        )}

        {phase === "saving" && <div className="py-10 text-center text-sm text-muted">{t("stmt.saving")}</div>}

        {phase === "done" && (
          <div className="py-6 text-center space-y-3">
            <div className="text-3xl">✅</div>
            <p className="text-sm">{t("stmt.done", { n: saved })}</p>
            <button onClick={onClose} className="glass rounded-2xl px-5 py-2 text-sm font-semibold">{t("common.close")}</button>
          </div>
        )}
        <span className="hidden">{lang}</span>
      </div>
    </Overlay>
  );
}
