import { useState } from "react";
import type { Group } from "../lib/types";
import { useT, useLang } from "../lib/i18n";
import { money, personColor, memberInitials, sortedMembers } from "../lib/format";
import {
  buildReport,
  monthsWithExpenses,
  monthLabel,
  reportToCsv,
  downloadFile,
  reportFilename,
  type Period,
} from "../lib/report";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export function ReportModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const months = monthsWithExpenses(group);
  const [period, setPeriod] = useState<Period>("all");
  const r = buildReport(group, period);
  const cur = group.currency;
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";
  const member = (id: string) => group.members.find((m) => m.id === id);
  const periodLabel = period === "all" ? t("report.allTime") : monthLabel(period, lang);

  const periods: { key: Period; label: string }[] = [
    { key: "all", label: t("report.allTime") },
    ...months.map((m) => ({ key: m as Period, label: monthLabel(m, lang) })),
  ];

  function downloadCsv() {
    downloadFile(reportFilename(group, period, "csv"), reportToCsv(group, period, t, lang));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col anim-up" style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
        {/* Cabecera (no se imprime) */}
        <div className="flex items-center gap-3 mb-4 no-print">
          <button
            onClick={onClose}
            className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted hover-lift"
            title={t("common.back")}
          >
            <Icon name="back" size={16} />
          </button>
          <h2 className="font-display text-2xl font-bold flex-1">{t("report.title")}</h2>
        </div>

        {/* Selector de periodo (no se imprime) */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto no-print pb-1">
          {periods.map((p) => {
            const on = p.key === period;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 ${on ? "" : "glass text-muted"}`}
                style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Botones de exportación (no se imprimen) */}
        <div className="flex gap-2 mb-4 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white hover-lift inline-flex items-center justify-center gap-1.5"
            style={{ background: "var(--ink)" }}
          >
            <Icon name="doc" size={15} /> {t("report.pdf")}
          </button>
          <button
            onClick={downloadCsv}
            className="flex-1 glass-strong rounded-full px-4 py-2.5 text-sm font-semibold hover-lift inline-flex items-center justify-center gap-1.5"
          >
            <Icon name="download" size={15} /> {t("report.csv")}
          </button>
        </div>

        {/* Área imprimible */}
        <div id="report-print" className="flex-1 overflow-y-auto pb-10 space-y-3">
          {/* Cabecera del documento */}
          <div className="glass rounded-3xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="glass rounded-2xl p-1">
                <Logo size={22} />
              </div>
              <span className="font-display font-bold text-lg">Settlia</span>
            </div>
            <div className="font-display text-xl font-bold">{group.name}</div>
            <div className="text-sm text-muted">
              {periodLabel} · {group.members.length} {t("report.members")} · {cur}
            </div>
          </div>

          {r.count === 0 ? (
            <div className="glass rounded-3xl p-10 text-center text-muted">{t("report.empty")}</div>
          ) : (
            <>
              {/* Totales */}
              <div className="glass rounded-3xl p-5">
                <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("report.summary")}</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="font-mono font-bold text-lg">{money(r.total, cur)}</div>
                    <div className="text-[11px] text-muted">{t("report.total")}</div>
                  </div>
                  <div>
                    <div className="font-mono font-bold text-lg">{r.count}</div>
                    <div className="text-[11px] text-muted">{t("report.count")}</div>
                  </div>
                  <div>
                    <div className="font-mono font-bold text-lg">{money(r.avg, cur)}</div>
                    <div className="text-[11px] text-muted">{t("report.avg")}</div>
                  </div>
                </div>
              </div>

              {/* Saldos por persona */}
              <div className="glass rounded-3xl p-5">
                <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("report.balances")}</div>
                <div className="space-y-1.5">
                  {sortedMembers(group.members).map((m) => {
                    const v = r.net[m.id] || 0;
                    const ok = Math.abs(v) < 0.01;
                    return (
                      <div key={m.id} className="flex items-center justify-between text-sm gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                            style={{ background: personColor(m.name) + "22", color: personColor(m.name) }}
                          >
                            {memberInitials(m)}
                          </span>
                          <span className="truncate">
                            {m.name}{" "}
                            <span className="text-muted text-xs">· {t("report.paidLabel", { amt: money(r.paid[m.id] || 0, cur) })}</span>
                          </span>
                        </span>
                        <span
                          className="font-mono font-bold text-right shrink-0"
                          style={{ color: ok ? "var(--muted)" : v > 0 ? "#0A8B5E" : "#D14444" }}
                        >
                          {ok ? t("report.settled") : v > 0 ? `+${money(v, cur)}` : `−${money(-v, cur)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Liquidación */}
              <div className="glass rounded-3xl p-5">
                <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("report.settlement")}</div>
                {r.transfers.length === 0 ? (
                  <div className="text-sm text-muted">{t("report.allSettled")}</div>
                ) : (
                  <div className="space-y-2">
                    {r.transfers.map((tr, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <b>{name(tr.from)}</b>
                        <Icon name="back" size={13} className="text-muted" style={{ transform: "rotate(180deg)" }} />
                        <b>{name(tr.to)}</b>
                        <span className="font-mono font-bold ml-auto">{money(tr.amount, cur)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detalle de gastos */}
              <div className="glass rounded-3xl p-5">
                <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("report.expenses")}</div>
                <div className="space-y-1.5">
                  {r.expenses.map((e) => {
                    const payer = e.payments?.length
                      ? e.payments.map((p) => name(p.memberId)).join(" + ")
                      : name(e.payerId);
                    return (
                      <div key={e.id} className="flex items-baseline justify-between gap-2 text-sm border-b py-1" style={{ borderColor: "var(--line)" }}>
                        <span className="min-w-0">
                          <span className="font-semibold">{e.label}</span>{" "}
                          <span className="text-muted text-xs">· {t(`cat.${e.category}`)} · {payer}</span>
                        </span>
                        <span className="font-mono shrink-0">{money(e.amount, cur)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pagos realizados */}
              {r.confirmed.length > 0 && (
                <div className="glass rounded-3xl p-5">
                  <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("report.payments")}</div>
                  <div className="space-y-1">
                    {r.confirmed.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 text-sm">
                        <Icon name="check" size={13} style={{ color: "#0A8B5E" }} />
                        <span>{t("pay.saysPaid", { from: name(s.from), amt: money(s.amount, cur), to: name(s.to) })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-muted text-center pt-2">{t("report.footer")}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
