import { useMemo, useState, type ChangeEvent } from "react";
import type { Group, Member } from "../lib/types";
import { useT } from "../lib/i18n";
import { money, uid, looksLikeSameName, displayName } from "../lib/format";
import { resolveToCode } from "../lib/currencies";
import { updateGroup } from "../lib/store";
import { withActivity } from "../lib/activity";
import { parseSplitwiseCsv, buildImport, csvNetTotals, type SwParsed } from "../lib/splitwiseImport";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

// "Importar gastos": trae un grupo de Splitwise desde su CSV ("Export as
// spreadsheet"). Paso 1: elegir el archivo. Paso 2: decir quién es quién (cada
// columna del CSV → un miembro del grupo o uno nuevo) y revisar el resumen.
// Todo se escribe de una vez; los ids son estables, así que reimportar el
// mismo CSV no duplica nada.

const NEW = "__new__";
const firstName = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

function guessMember(name: string, members: Member[]): string {
  const exact = members.find((m) => looksLikeSameName(name, m.name) || (m.nick && looksLikeSameName(name, m.nick)));
  if (exact) return exact.id;
  const byFirst = members.filter((m) => firstName(m.name) === firstName(name));
  return byFirst.length === 1 ? byFirst[0].id : NEW;
}

export function ImportExpensesModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [parsed, setParsed] = useState<SwParsed | null>(null);
  const [error, setError] = useState(false);
  const [map, setMap] = useState<string[]>([]);
  const [done, setDone] = useState<{ e: number; p: number } | null>(null);
  const groupCode = resolveToCode(group.currency);

  async function onFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const p = parseSplitwiseCsv(await f.text());
      if (!p.expenses.length && !p.payments.length) throw new Error("empty");
      setParsed(p);
      setMap(p.people.map((n) => guessMember(n, group.members)));
      setError(false);
    } catch {
      setParsed(null);
      setError(true);
    }
  }

  // Comprobación: los saldos reconstruidos cuadran con la fila "Total balance".
  const check = useMemo(() => {
    if (!parsed) return null;
    const rows = csvNetTotals(parsed);
    const codes = Object.keys(parsed.totals);
    if (!codes.length) return null;
    return codes.every((c) => (parsed.totals[c] ?? []).every((v, k) => Math.abs(v - (rows[c]?.[k] ?? 0)) < 0.02));
  }, [parsed]);

  function doImport() {
    if (!parsed) return;
    let added = 0;
    let result = { e: 0, p: 0 };
    updateGroup(group.id, (g) => {
      // Miembros nuevos para las columnas sin pareja.
      const ids = map.slice();
      const newMembers: Member[] = [];
      parsed.people.forEach((name, k) => {
        if (ids[k] !== NEW) return;
        const id = uid();
        ids[k] = id;
        newMembers.push({ id, name, avatar: "", claimed: false } as Member);
      });
      const built = buildImport(parsed, ids, groupCode, g.meId);
      const existing = new Set(g.expenses.map((e) => e.id));
      const existingS = new Set((g.settlements ?? []).map((s) => s.id));
      const exps = built.expenses.filter((e) => !existing.has(e.id));
      const sets = built.settlements.filter((s) => !existingS.has(s.id));
      added = exps.length + sets.length;
      result = { e: exps.length, p: sets.length };
      const foreign = parsed.currencies.some((c) => c !== groupCode);
      return {
        ...g,
        members: [...g.members, ...newMembers],
        expenses: [...exps, ...g.expenses],
        settlements: [...(g.settlements ?? []), ...sets],
        multiCurrency: foreign ? true : g.multiCurrency,
        activity: added
          ? withActivity(g, {
              type: "expense_added",
              actorId: g.meId,
              actorName: g.members.find((m) => m.id === g.meId)?.name,
              label: `Splitwise · ${exps.length}`,
            })
          : g.activity,
      };
    });
    setDone(result);
  }

  const totalsByCur = useMemo(() => {
    if (!parsed) return [];
    const out: Record<string, number> = {};
    for (const e of parsed.expenses) out[e.currency] = (out[e.currency] ?? 0) + e.cost;
    return Object.entries(out);
  }, [parsed]);

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-6 anim-pop max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl font-bold">{t("import.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm">{t("import.done", { e: done.e, p: done.p })}</p>
            {map.some((m) => m === NEW) && <p className="text-xs text-muted mt-2">{t("import.claimHint")}</p>}
            <button onClick={onClose} className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--teal)" }}>
              {t("common.close")}
            </button>
          </div>
        ) : !parsed ? (
          <>
            <p className="text-sm text-muted mb-3">{t("import.intro")}</p>
            <ol className="text-xs text-muted space-y-1 mb-4 list-decimal pl-4">
              <li>{t("import.step1")}</li>
              <li>{t("import.step2")}</li>
              <li>{t("import.step3")}</li>
            </ol>
            <label className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white cursor-pointer" style={{ background: "var(--teal)" }}>
              <Icon name="doc" size={16} />
              {t("import.pick")}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </label>
            {error && <p className="text-xs mt-3" style={{ color: "var(--coral)" }}>{t("import.error")}</p>}
          </>
        ) : (
          <>
            <div className="glass rounded-2xl px-4 py-3 text-sm mb-3">
              <div className="font-semibold">{t("import.summary", { e: parsed.expenses.length, p: parsed.payments.length })}</div>
              <div className="text-xs text-muted mt-1">
                {totalsByCur.map(([c, v]) => money(v, c)).join(" · ")}
              </div>
              {parsed.currencies.some((c) => c !== groupCode) && (
                <div className="text-xs mt-1.5" style={{ color: "var(--teal)" }}>
                  {t("import.multi", { list: parsed.currencies.join(" + ") })}
                </div>
              )}
              {check != null && (
                <div className="text-xs mt-1.5" style={{ color: check ? "#0A8B5E" : "var(--amber)" }}>
                  {check ? t("import.checkOk") : t("import.checkBad")}
                </div>
              )}
            </div>

            <div className="text-xs font-semibold text-muted mb-1.5">{t("import.whoIsWho")}</div>
            <div className="space-y-1.5 mb-4">
              {parsed.people.map((name, k) => (
                <div key={name + k} className="flex items-center gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{name}</span>
                  <select
                    value={map[k]}
                    onChange={(e) => setMap((prev) => prev.map((v, i) => (i === k ? e.target.value : v)))}
                    className="glass rounded-xl px-2 py-1.5 text-sm min-w-0 flex-1"
                  >
                    {group.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {displayName(m)}{m.id === group.meId ? ` (${t("common.you")})` : ""}
                      </option>
                    ))}
                    <option value={NEW}>{t("import.newMember")}</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={doImport} className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white" style={{ background: "var(--teal)" }}>
                {t("import.cta", { n: parsed.expenses.length + parsed.payments.length })}
              </button>
              <button onClick={() => setParsed(null)} className="glass rounded-full px-4 py-2.5 text-sm text-muted">
                {t("common.back")}
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
