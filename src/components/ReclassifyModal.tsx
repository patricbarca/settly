import { useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { CATEGORIES, type Category } from "../lib/types";
import type { MyItem } from "../lib/personal";
import { classifyExpensesAI } from "../lib/ai";
import { consumeAI } from "../lib/plan";
import { patchExpense } from "../lib/store";
import { categoryColor, fmtDate, money } from "../lib/format";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";

const BATCH = 60;
const KNOWN = new Set(CATEGORIES.map((c) => c.id as string));

/** "Reclasificar con IA": la IA propone categoría para los gastos aún no
 *  revisados (primero los de "Otros"); el usuario acepta, cambia o descarta
 *  cada propuesta. Todo lo enviado queda marcado `aiReviewed` y no se vuelve
 *  a analizar. */
export function ReclassifyModal({ items, onClose }: { items: MyItem[]; onClose: () => void }) {
  const t = useT();
  const catName = (c: string) => (KNOWN.has(c) ? t(`cat.${c}`) : c);
  const pending = useMemo(
    () => items.filter((i) => !i.aiReviewed).sort((a, b) => (a.category === "otros" ? 0 : 1) - (b.category === "otros" ? 0 : 1) || (a.date < b.date ? 1 : -1)),
    [items],
  );
  const batch = pending.slice(0, BATCH);
  const others = pending.filter((i) => i.category === "otros").length;
  const [phase, setPhase] = useState<"intro" | "busy" | "review" | "saving" | "done">("intro");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<MyItem[]>([]);
  const [choice, setChoice] = useState<Record<string, { cat: string; on: boolean }>>({});
  const [changed, setChanged] = useState(0);

  async function run() {
    setErr(null);
    if (!consumeAI("text")) { setErr(t("proj.aiQuota")); return; }
    setPhase("busy");
    try {
      const res = await classifyExpensesAI({
        items: batch.map((i) => ({ id: i.key, label: i.label, category: i.category, group: i.personal ? "Personal" : i.groupName })),
        categories: CATEGORIES.map((c) => c.id),
        labels: Object.fromEntries(CATEGORIES.map((c) => [c.id, catName(c.id)])),
      });
      const map: Record<string, { cat: string; on: boolean }> = {};
      for (const s of res) {
        const it = batch.find((i) => i.key === s.id);
        if (it && s.category !== it.category) map[it.key] = { cat: s.category, on: true };
      }
      setSent(batch);
      setChoice(map);
      setPhase("review");
    } catch (e) {
      setPhase("intro");
      if ((e as Error)?.name !== "AIConsentDeclined") setErr(t("proj.aiError"));
    }
  }

  async function apply() {
    setPhase("saving");
    let n = 0;
    for (const i of sent) {
      const c = choice[i.key];
      const patch = c?.on ? { category: c.cat as Category, aiReviewed: true } : { aiReviewed: true };
      if (c?.on) n++;
      await patchExpense(i.groupId, i.expenseId, patch);
    }
    setChanged(n);
    setPhase("done");
  }

  const proposals = sent.filter((i) => choice[i.key]);

  return (
    <Overlay onClose={phase === "saving" ? () => {} : onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 anim-pop max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold inline-flex items-center gap-2"><Icon name="sparkles" size={18} /> {t("reclass.title")}</h3>
          {phase !== "saving" && <button onClick={onClose} className="glass rounded-full p-1.5"><Icon name="close" size={16} /></button>}
        </div>

        {(phase === "intro" || phase === "busy") && (
          <>
            <p className="text-sm text-muted mt-2">{t("reclass.intro")}</p>
            {pending.length === 0 ? (
              <p className="text-sm mt-4 font-semibold">{t("reclass.nothing")}</p>
            ) : (
              <>
                <div className="text-sm mt-3">
                  {t("reclass.pending", { n: String(pending.length), others: String(others) })}
                  {pending.length > BATCH && <div className="text-xs text-muted mt-1">{t("reclass.batch", { n: String(BATCH) })}</div>}
                </div>
                <button
                  onClick={run}
                  disabled={phase === "busy"}
                  className="w-full rounded-full py-3 font-semibold text-white mt-4 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                  style={{ background: "linear-gradient(90deg, var(--indigo), var(--teal))" }}
                >
                  <Icon name="sparkles" size={16} /> {phase === "busy" ? t("proj.aiThinking") : t("reclass.run", { n: String(batch.length) })}
                </button>
              </>
            )}
            {err && <p className="text-xs mt-2" style={{ color: "var(--coral)" }}>{err}</p>}
          </>
        )}

        {phase === "review" && (
          <>
            <p className="text-sm text-muted mt-2">
              {proposals.length ? t("reclass.reviewHint", { n: String(proposals.length), total: String(sent.length) }) : t("reclass.allRight", { total: String(sent.length) })}
            </p>
            <div className="mt-3 space-y-2">
              {proposals.map((i) => {
                const c = choice[i.key];
                return (
                  <div key={i.key} className="glass rounded-2xl p-3 text-sm" style={{ opacity: c.on ? 1 : 0.55 }}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={c.on} onChange={(e) => setChoice({ ...choice, [i.key]: { ...c, on: e.target.checked } })} className="mt-1 h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold truncate">{i.label}</span>
                          <span className="font-mono text-xs shrink-0">{money(i.amount, i.currency)}</span>
                        </div>
                        <div className="text-xs text-muted truncate">{fmtDate(i.date)} · {i.personal ? t("mine.personal") : i.groupName}</div>
                        <div className="flex items-center gap-1.5 mt-2 text-xs">
                          <span className="px-2 py-0.5 rounded-full" style={{ background: categoryColor(i.category) + "26" }}>{catName(i.category)}</span>
                          <span>→</span>
                          <select
                            value={c.cat}
                            onChange={(e) => setChoice({ ...choice, [i.key]: { cat: e.target.value, on: true } })}
                            className="flex-1 min-w-0 rounded-full px-2 py-1 font-semibold"
                            style={{ background: categoryColor(c.cat) + "33" }}
                          >
                            {CATEGORIES.map((x) => <option key={x.id} value={x.id}>{catName(x.id)}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted mt-3">{t("reclass.sharedNote")}</p>
            <button onClick={apply} className="w-full rounded-full py-3 font-semibold text-white mt-3" style={{ background: "var(--teal)" }}>
              {t("reclass.apply", { n: String(proposals.filter((i) => choice[i.key].on).length) })}
            </button>
          </>
        )}

        {phase === "saving" && <p className="text-sm mt-4">{t("reclass.saving")}</p>}

        {phase === "done" && (
          <>
            <p className="text-sm mt-4 font-semibold">{t("reclass.done", { n: String(changed) })}</p>
            {pending.length > sent.length && <p className="text-xs text-muted mt-1">{t("reclass.more", { n: String(pending.length - sent.length) })}</p>}
            <button onClick={onClose} className="w-full glass rounded-full py-3 font-semibold mt-4">{t("common.close")}</button>
          </>
        )}
      </div>
    </Overlay>
  );
}
