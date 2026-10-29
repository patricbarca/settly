import { useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { useEnsurePersonalGroup } from "../lib/personal";
import { usePlan } from "../lib/plan";
import { fmtDate, money } from "../lib/format";
import { resolveToCode } from "../lib/currencies";
import type { Expense } from "../lib/types";
import { Icon } from "./Icon";
import { Paywall } from "./Paywall";
import { StatementImportModal } from "./StatementImportModal";
import { StatementInbox, stmtKey } from "./StatementInbox";

interface Stmt {
  id: string;
  name: string;
  importedAt: string;
  from: string;
  to: string;
  items: Expense[];
  pending: number;
}

/** Sección "Banco": tus estados de cuenta importados, cada uno con sus fechas.
 *  Tocar uno muestra sus movimientos para revisarlos y pasarlos a Mis gastos. */
export function StatementsView() {
  const t = useT();
  const personal = useEnsurePersonalGroup();
  const pro = usePlan() === "pro";
  const [importing, setImporting] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const stmts = useMemo(() => {
    const m = new Map<string, Stmt>();
    for (const e of personal?.expenses ?? []) {
      const k = stmtKey(e);
      if (!k) continue;
      const s = m.get(k) ?? { id: k, name: e.statementName || t("bank.legacy"), importedAt: e.importedAt || "", from: e.date, to: e.date, items: [], pending: 0 };
      s.items.push(e);
      if (e.inbox) s.pending++;
      if (e.date < s.from) s.from = e.date;
      if (e.date > s.to) s.to = e.date;
      m.set(k, s);
    }
    return [...m.values()].sort((a, b) => (b.importedAt || b.to).localeCompare(a.importedAt || a.to));
  }, [personal?.expenses, t]);

  if (!personal) return <div className="px-4 py-10 text-center text-sm text-muted">…</div>;
  const cur = (e: Expense) => resolveToCode(e.currency ?? personal.currency);
  const open = stmts.find((s) => s.id === openId);

  return (
    <div className="px-4 pt-3 pb-28 max-w-md mx-auto">
      {open ? (
        <>
          <button onClick={() => setOpenId(null)} className="text-sm font-semibold inline-flex items-center gap-1 mb-1" style={{ color: "var(--teal)" }}>
            <Icon name="chevron" size={14} className="rotate-90" /> {t("bank.all")}
          </button>
          <p className="text-xs text-muted">{fmtDate(open.from)} – {fmtDate(open.to)}</p>
          <StatementInbox personal={personal} statementId={open.id} title={open.name} />
        </>
      ) : (
        <>
          <h2 className="font-display text-2xl font-bold">{t("bank.title")}</h2>
          <p className="text-sm text-muted mt-1">{t("bank.intro")}</p>
          <button
            onClick={() => (pro ? setImporting(true) : setPaywall(true))}
            className="w-full rounded-2xl py-3 mt-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2"
            style={{ background: "var(--teal)" }}
          >
            <Icon name="doc" size={16} /> {t("stmt.title")}{!pro && <span className="text-[9px] font-bold ml-1">PRO</span>}
          </button>

          {stmts.length === 0 ? (
            <p className="text-sm text-muted text-center mt-10">{t("bank.empty")}</p>
          ) : (
            <div className="space-y-2 mt-5">
              {stmts.map((s) => {
                const total = s.items.reduce((sum, e) => sum + e.amount, 0);
                return (
                  <button key={s.id} onClick={() => setOpenId(s.id)} className="glass rounded-3xl w-full p-4 flex items-center gap-3 text-left hover-lift">
                    <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0" style={{ background: "rgba(15,163,163,0.16)", color: "var(--teal)" }}>
                      <Icon name="doc" size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold truncate">{s.name}</span>
                      <span className="block text-xs text-muted">{fmtDate(s.from)} – {fmtDate(s.to)} · {t("bank.count", { n: s.items.length })}</span>
                      {s.pending > 0 && (
                        <span className="inline-block text-[10px] font-semibold mt-1 rounded-full px-1.5 py-0.5" style={{ background: "rgba(232,146,12,.15)", color: "var(--amber)" }}>
                          {t("bank.pending", { n: s.pending })}
                        </span>
                      )}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-mono font-semibold">{money(total, cur(s.items[0]))}</span>
                      <Icon name="chevron" size={14} className="text-muted -rotate-90 ml-auto" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {importing && <StatementImportModal personal={personal} onClose={() => setImporting(false)} />}
      {paywall && <Paywall onClose={() => setPaywall(false)} />}
    </div>
  );
}
