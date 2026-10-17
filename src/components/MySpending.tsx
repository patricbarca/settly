import { useEffect, useMemo, useState } from "react";
import { useT, useLang } from "../lib/i18n";
import { useGroups, setActiveGroup, deleteExpense } from "../lib/store";
import { useUser } from "../lib/auth";
import { money, fmtDate, categoryColor } from "../lib/format";
import { resolveToCode } from "../lib/currencies";
import { getDailyRate } from "../lib/fxCache";
import { monthKey, monthLabel } from "../lib/report";
import { CATEGORIES } from "../lib/types";
import { myItems, useEnsurePersonalGroup, type MyItem } from "../lib/personal";
import { Icon } from "./Icon";
import { AddExpense } from "./AddExpense";
import { ConfirmModal } from "./ConfirmModal";
import { haptic } from "../lib/haptics";
import { useArchivedGroups } from "../lib/archivedGroups";
import { heroBackground, HeroCover } from "../lib/heroStyle";
import { GroupSettings } from "./GroupSettings";
import { ProjectionView } from "./ProjectionView";
import { ReclassifyModal } from "./ReclassifyModal";
import { VaultNewsModal, vaultNewsHidden } from "./VaultNewsModal";
import { fixedItems } from "../lib/projection";
import { usePlan } from "../lib/plan";
import { Paywall } from "./Paywall";

type Mode = "converted" | "byCurrency" | "projection";

const catIcon = (c: string) => CATEGORIES.find((x) => x.id === c)?.icon ?? "other";

/** "Mis gastos": mi parte de cada gasto de mis grupos + mis gastos personales.
 *  Dos vistas: todo convertido a mi moneda principal (tasa de hoy) o un
 *  bloque por moneda, sin convertir. Lo personal se añade con el mismo + de
 *  siempre (IA, voz, escaneo y su cupo gratis incluidos) sobre un grupo
 *  privado de una sola persona. */
export function MySpending() {
  const t = useT();
  const lang = useLang();
  const user = useUser();
  const groups = useGroups();
  const personal = useEnsurePersonalGroup();
  const { archived: localArchived } = useArchivedGroups();
  const [reclass, setReclass] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // Novedades: se abren al entrar salvo "no volver a mostrar".
  const [news, setNews] = useState(() => !vaultNewsHidden());
  const all = useMemo(() => myItems(groups, localArchived), [groups, localArchived]);
  const [editing, setEditing] = useState(false);
  const pro = usePlan() === "pro";
  const fixed = useMemo(() => fixedItems(groups, localArchived), [groups, localArchived]);
  // Cabecera compacta al bajar (histéresis 60/8 px, como en los grupos).
  const [compact, setCompact] = useState(false);

  const nowKey = new Date().toLocaleDateString("en-CA").slice(0, 7);
  const months = useMemo(() => {
    const s = new Set(all.map((i) => monthKey(i.date)).filter(Boolean));
    s.add(nowKey);
    return [...s].sort().reverse();
  }, [all, nowKey]);
  const [period, setPeriod] = useState<string>("thisMonth");
  const [mode, setMode] = useState<Mode>("converted");
  // all = grupos activos + personal · allArch = también archivados · personal · id de grupo
  const [source, setSource] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<MyItem | null>(null);

  // Grupos con gastos míos para el desplegable (activos primero, luego archivados).
  const sources = useMemo(() => {
    const seen = new Map<string, { name: string; archived: boolean }>();
    for (const i of all) if (!i.personal && !seen.has(i.groupId)) seen.set(i.groupId, { name: i.groupName, archived: i.archived });
    const list = [...seen.entries()].map(([id, v]) => ({ id, ...v })).sort((x, y) => x.name.localeCompare(y.name));
    return { active: list.filter((x) => !x.archived), archived: list.filter((x) => x.archived) };
  }, [all]);

  const prevKey = (() => {
    const [y, m] = nowKey.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  })();
  const from3 = (() => {
    const [y, m] = nowKey.split("-").map(Number);
    const d = new Date(y, m - 3, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const inPeriod = (date: string) => {
    const k = monthKey(date);
    if (period === "all") return true;
    if (period === "thisMonth") return k === nowKey;
    if (period === "lastMonth") return k === prevKey;
    if (period === "last3") return k >= from3 && k <= nowKey;
    if (period === "thisYear") return k.slice(0, 4) === nowKey.slice(0, 4);
    return k === period.slice(2); // "m:YYYY-MM"
  };
  const inSource = (i: MyItem) =>
    source === "all" ? !i.archived : source === "allArch" ? true : source === "personal" ? i.personal : i.groupId === source;
  const items = all.filter((i) => inPeriod(i.date) && inSource(i));

  // Moneda principal: la del perfil; si no, la más usada en mis gastos.
  const mainCur = useMemo(() => {
    if (user?.mainCurrency) return resolveToCode(user.mainCurrency);
    const c: Record<string, number> = {};
    for (const i of all) c[i.currency] = (c[i.currency] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || "EUR";
  }, [user?.mainCurrency, all]);

  const currencies = useMemo(() => {
    const set = new Set(items.map((i) => i.currency));
    return [...set].sort((a, b) => (a === mainCur ? -1 : b === mainCur ? 1 : a.localeCompare(b)));
  }, [items, mainCur]);

  // Tasas de hoy hacia la moneda principal (cacheadas por día en fxCache).
  const [rates, setRates] = useState<Record<string, number | null>>({});
  const rateCurs = [
    ...new Set([
      ...all.map((i) => i.currency),
      ...fixed.map((f) => f.currency),
      ...(personal?.budget?.incomes ?? []).map((i) => i.currency),
      ...(personal?.budget?.savings ? [personal.budget.savings.currency] : []),
    ]),
  ].sort();
  const curKey = rateCurs.join(",") + "|" + mainCur;
  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, number | null> = {};
      for (const c of rateCurs) next[c] = c === mainCur ? 1 : await getDailyRate(c, mainCur);
      if (alive) setRates(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey]);
  const conv = (i: MyItem) => {
    const r = i.currency === mainCur ? 1 : rates[i.currency];
    return r == null ? null : i.amount * r;
  };
  const missingRate = currencies.some((c) => c !== mainCur && rates[c] == null);

  const totalConv = items.reduce((s, i) => s + (conv(i) ?? 0), 0);
  const byCat = (list: MyItem[], value: (i: MyItem) => number) => {
    const m: Record<string, number> = {};
    for (const i of list) m[i.category] = (m[i.category] || 0) + value(i);
    return Object.entries(m).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
  };


  const CatBars = ({ rows, cur }: { rows: [string, number][]; cur: string }) => {
    const max = rows[0]?.[1] || 1;
    return (
      <div className="space-y-2 mt-3">
        {rows.map(([c, v]) => (
          <div key={c} className="flex items-center gap-2 text-sm">
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: categoryColor(c) + "33", color: categoryColor(c) }}>
              <Icon name={catIcon(c)} size={13} />
            </span>
            <span className="w-24 truncate shrink-0">{t(`cat.${c}`)}</span>
            <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--seg-track)" }}>
              <span className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: categoryColor(c) }} />
            </span>
            <span className="font-mono text-xs w-20 text-right shrink-0">{money(v, cur)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col anim-up" style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
        <div
          className="flex-1 overflow-y-auto -mx-4 px-4"
          onScroll={(e) => {
            const y = e.currentTarget.scrollTop;
            setCompact((c) => (c ? y > 8 : y > 60));
          }}
          style={{ paddingBottom: "calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 96px)" }}>
          {/* Cabecera flotante: se queda arriba y el contenido pasa por debajo. */}
          <div className="sticky top-0 z-10 -mx-4 px-4 pb-3 pt-1 floating-header" data-stuck={compact}>
          {/* Cabecera editable como la de cualquier grupo (nombre, color o foto). */}
          <div
            className="hero relative"
            style={{ ...(personal ? heroBackground(personal) : {}), padding: compact ? "10px 18px" : "16px 22px", transition: "padding .3s ease" }}
          >
            {personal && <HeroCover g={personal} />}
            {!(personal && heroBackground(personal)) && (
              <>
                <span className="blob b1" />
                <span className="blob b2" />
                <span className="blob b3" />
              </>
            )}
            <div className="relative z-10 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-white/70 font-semibold" style={{ maxHeight: compact ? 0 : 80, opacity: compact ? 0 : 1, overflow: "hidden", transition: "max-height .3s ease, opacity .2s ease" }}>{t("mine.title")}</div>
                <div className="font-display font-extrabold text-white truncate" style={{ fontSize: compact ? 18 : 24, transition: "font-size .3s ease" }}>🔒 {personal?.name || t("mine.personal")}</div>
                <div className="text-xs text-white/75 mt-0.5" style={{ maxHeight: compact ? 0 : 80, opacity: compact ? 0 : 1, overflow: "hidden", transition: "max-height .3s ease, opacity .2s ease" }}>{t("mine.subtitle")}</div>
              </div>
              <button
                onClick={() => setNews(true)}
                className="h-9 rounded-full px-3 flex items-center gap-1 text-white text-xs font-semibold shrink-0"
                style={{ background: "rgba(255,255,255,.18)" }}
                aria-label={t("vnews.button")}
              >
                <Icon name="sparkles" size={14} />{!compact && <span>{t("vnews.button")}</span>}
              </button>
              {personal && (
                <button
                  onClick={() => setEditing(true)}
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ background: "rgba(255,255,255,.18)" }}
                  aria-label={t("settings.title")}
                >
                  <Icon name="settings" size={16} />
                </button>
              )}
            </div>
          </div>
          </div>
          {/* Vista */}
          <div className="seg mb-3" role="tablist">
            <button role="tab" aria-selected={mode === "converted"} onClick={() => { haptic("selection"); setMode("converted"); }}>
              {t("mine.allIn", { cur: mainCur })}
            </button>
            <button role="tab" aria-selected={mode === "byCurrency"} onClick={() => { haptic("selection"); setMode("byCurrency"); }}>
              {t("mine.byCurrency")}
            </button>
            <button role="tab" aria-selected={mode === "projection"} onClick={() => { haptic("selection"); setMode("projection"); }}>
              {t("mine.projection")}
            </button>
          </div>

          {mode !== "projection" && (<>
          {/* Filtros: periodo y grupo */}
          <div className="flex gap-2 mb-3">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="glass rounded-xl px-3 py-2.5 text-sm font-semibold flex-1 min-w-0" aria-label={t("mine.period")}>
              <option value="thisMonth">{t("mine.thisMonth")}</option>
              <option value="lastMonth">{t("mine.lastMonth")}</option>
              <option value="last3">{t("mine.last3")}</option>
              <option value="thisYear">{t("mine.thisYear")}</option>
              <option value="all">{t("mine.allTime")}</option>
              {months.length > 0 && (
                <optgroup label={t("mine.byMonth")}>
                  {months.map((m) => (
                    <option key={m} value={`m:${m}`}>{monthLabel(m, lang)}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="glass rounded-xl px-3 py-2.5 text-sm font-semibold flex-1 min-w-0" aria-label={t("mine.source")}>
              <option value="all">{t("mine.allSources")}</option>
              <option value="personal">🔒 {personal?.name || t("mine.personal")}</option>
              {sources.active.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
              {sources.archived.length > 0 && (
                <optgroup label={t("mine.archivedGroups")}>
                  <option value="allArch">{t("mine.allInclArchived")}</option>
                  {sources.archived.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          </>)}

          {mode === "projection" ? (
            personal && (
              <ProjectionView
                personal={personal}
                items={all.filter((i) => !i.archived)}
                fixed={fixed}
                mainCur={mainCur}
                rate={(c) => (c === mainCur ? 1 : rates[c] ?? null)}
                pro={pro}
              />
            )
          ) : items.length === 0 ? (
            <div className="glass rounded-3xl p-6 text-center">
              <div className="text-3xl mb-2">🧾</div>
              <div className="font-semibold">{t("mine.empty")}</div>
              <p className="text-sm text-muted mt-1">{t("mine.emptyHint")}</p>
            </div>
          ) : mode === "converted" ? (
            <div className="glass-strong rounded-3xl p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("mine.spent")}</div>
              <div className="font-display text-4xl font-bold mt-1 font-mono">{money(totalConv, mainCur)}</div>
              <div className="text-xs text-muted mt-1">
                {t(items.length === 1 ? "mine.count1" : "mine.count", { n: String(items.length) })}
                {currencies.length > 1 && <> · {t("mine.convertedNote", { list: currencies.filter((c) => c !== mainCur).join(", ") })}</>}
              </div>
              {missingRate && <div className="text-xs mt-2" style={{ color: "var(--amber)" }}>{t("mine.rateMissing")}</div>}
              <CatBars rows={byCat(items, (i) => conv(i) ?? 0)} cur={mainCur} />
            </div>
          ) : (
            <div className="space-y-3">
              {currencies.map((c) => {
                const list = items.filter((i) => i.currency === c);
                const sum = list.reduce((s, i) => s + i.amount, 0);
                return (
                  <div key={c} className="glass-strong rounded-3xl p-5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{t("mine.spentIn", { cur: c })}</span>
                      <span className="text-xs text-muted">{t(list.length === 1 ? "mine.count1" : "mine.count", { n: String(list.length) })}</span>
                    </div>
                    <div className="font-display text-3xl font-bold mt-1 font-mono">{money(sum, c)}</div>
                    <CatBars rows={byCat(list, (i) => i.amount)} cur={c} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Movimientos */}
          {mode !== "projection" && items.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 mt-6 mb-2">
                <h3 className="font-display text-lg font-bold">{t("mine.movements")}</h3>
                <button onClick={() => (pro ? setReclass(true) : setShowPaywall(true))} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--teal)" }}>
                  <Icon name="sparkles" size={13} /> {t("reclass.button")}{!pro && <span className="text-[9px] font-bold ml-0.5">PRO</span>}
                </button>
              </div>
              <div className="glass rounded-3xl divide-y divide-[var(--line)]">
                {items.map((i) => {
                  const cv = conv(i);
                  const isOpen = open === i.key;
                  return (
                    <div key={i.key}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        onClick={() => (i.personal ? setOpen(isOpen ? null : i.key) : setActiveGroup(i.groupId))}
                      >
                        <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: categoryColor(i.category) + "26", color: categoryColor(i.category) }}>
                          <Icon name={catIcon(i.category)} size={16} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold truncate">{i.label}</span>
                          <span className="block text-xs text-muted truncate">
                            {fmtDate(i.date)} · {i.personal ? t("mine.personal") : i.groupName}
                            {!i.personal && Math.abs(i.total - i.amount) > 0.004 && <> · {t("mine.ofTotal", { total: money(i.total, i.currency) })}</>}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-mono font-semibold">{money(i.amount, i.currency)}</span>
                          {mode === "converted" && i.currency !== mainCur && cv != null && (
                            <span className="block text-[11px] text-muted font-mono">≈ {money(cv, mainCur)}</span>
                          )}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 -mt-1 flex justify-end">
                          <button
                            className="rounded-full px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
                            style={{ color: "var(--coral)", background: "color-mix(in srgb, var(--coral) 12%, transparent)" }}
                            onClick={() => setConfirmDel(i)}
                          >
                            <Icon name="trash" size={13} /> {t("mine.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* + flotante: añade un gasto SOLO mío (grupo personal). */}
      {personal && <AddExpense group={personal} />}

      {editing && personal && <GroupSettings group={personal} onClose={() => setEditing(false)} />}
      {news && <VaultNewsModal onClose={() => setNews(false)} />}
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
      {reclass && <ReclassifyModal items={all} onClose={() => setReclass(false)} />}

      {confirmDel && (
        <ConfirmModal
          title={t("mine.deleteTitle")}
          message={confirmDel.label}
          confirmLabel={t("mine.delete")}
          onConfirm={() => {
            deleteExpense(confirmDel.groupId, confirmDel.expenseId);
            setConfirmDel(null);
            setOpen(null);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

