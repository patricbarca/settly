import { useState } from "react";
import type { Group } from "../lib/types";
import { shareFor } from "../lib/split";
import { displayName } from "../lib/format";
import { useGroupMoney } from "../lib/displayCurrency";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** Explica CÓMO se llega al saldo de un miembro: su parte de cada gasto, lo que
 *  adelantó, y los pagos que hizo/recibió → saldo final. Se recalcula en vivo
 *  desde el estado del grupo (se re-renderiza con cada pago). No guarda nada. */
export function BalanceExplainer({
  group,
  memberId,
  onClose,
}: {
  group: Group;
  memberId: string;
  onClose: () => void;
}) {
  const t = useT();
  const money = useGroupMoney(group);
  const [showHelp, setShowHelp] = useState(false);
  const ids = group.members.map((m) => m.id);
  const me = group.members.find((m) => m.id === memberId);
  const settles = (s: { status: string }) => s.status === "confirmed" || s.status === "pending";

  // Parte de cada gasto en el que participa.
  const rows = group.expenses
    .map((e) => ({
      label: e.label,
      total: Number(e.amount || 0),
      n: (e.participantIds?.length ? e.participantIds.length : ids.length) || 1,
      share: shareFor(e, ids)[memberId] || 0,
    }))
    .filter((x) => x.share > 0.005);
  const totalShare = Math.round(rows.reduce((s, x) => s + x.share, 0) * 100) / 100;

  // Lo que adelantó (puso de su bolsillo en los gastos).
  let fronted = 0;
  for (const e of group.expenses) {
    if (e.payments?.length) {
      for (const p of e.payments) if (p.memberId === memberId) fronted += Number(p.amount || 0);
    } else if (e.payerId === memberId) {
      fronted += Number(e.amount || 0);
    }
  }
  fronted = Math.round(fronted * 100) / 100;

  const paymentsMade = Math.round(
    (group.settlements ?? []).filter((s) => settles(s) && s.from === memberId).reduce((a, s) => a + Number(s.amount || 0), 0) * 100
  ) / 100;
  const paymentsReceived = Math.round(
    (group.settlements ?? []).filter((s) => settles(s) && s.to === memberId).reduce((a, s) => a + Number(s.amount || 0), 0) * 100
  ) / 100;

  const net = Math.round((fronted + paymentsMade - (totalShare + paymentsReceived)) * 100) / 100;
  const settled = Math.abs(net) < 0.01;

  const Line = ({ label, value, sign }: { label: string; value: number; sign: "+" | "-" }) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted">{label}</span>
      <span className="font-mono">{sign === "-" ? "−" : "+"}{money(value)}</span>
    </div>
  );

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-display text-xl font-bold flex-1">
            {t("explain.title", { name: me ? displayName(me) : "?" })}
          </h3>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="h-7 w-7 rounded-full glass flex items-center justify-center text-muted hover-lift shrink-0"
            title={t("explain.help.title")}
            aria-label={t("explain.help.title")}
          >
            <Icon name="help" size={14} />
          </button>
        </div>

        {/* Leyenda: qué significa cada línea */}
        {showHelp && (
          <div className="glass rounded-2xl p-3 mb-3 text-xs text-muted space-y-1.5">
            <div className="font-semibold text-[color:var(--ink)]">{t("explain.help.title")}</div>
            <p>• {t("explain.help.share")}</p>
            <p>• {t("explain.help.fronted")}</p>
            <p>• {t("explain.help.made")}</p>
            <p>• {t("explain.help.received")}</p>
            <p>• {t("explain.help.result")}</p>
          </div>
        )}

        {/* Parte de los gastos */}
        <div className="glass rounded-2xl p-3 mb-3">
          <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-2">{t("explain.share")}</div>
          <div className="space-y-1">
            {rows.length === 0 ? (
              <div className="text-sm text-muted">—</div>
            ) : (
              rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="min-w-0 truncate">
                    {r.label} <span className="text-muted text-xs">· {t("explain.splitAmong", { n: r.n })}</span>
                  </span>
                  <span className="font-mono shrink-0">{money(r.share)}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between text-sm font-semibold border-t mt-2 pt-2" style={{ borderColor: "var(--line)" }}>
            <span>{t("explain.shareTotal")}</span>
            <span className="font-mono">{money(totalShare)}</span>
          </div>
        </div>

        {/* Ajustes */}
        <div className="glass rounded-2xl p-3 mb-3">
          {fronted > 0.005 && <Line label={t("explain.fronted")} value={fronted} sign="+" />}
          {paymentsMade > 0.005 && <Line label={t("explain.paymentsMade")} value={paymentsMade} sign="+" />}
          {paymentsReceived > 0.005 && <Line label={t("explain.paymentsReceived")} value={paymentsReceived} sign="-" />}
          <Line label={t("explain.shareOwed")} value={totalShare} sign="-" />
        </div>

        {/* Resultado */}
        <div
          className="rounded-2xl p-4 text-center"
          style={{ background: settled ? "var(--glass)" : net < 0 ? "rgba(209,68,68,0.12)" : "rgba(10,139,94,0.12)" }}
        >
          <div className="text-xs text-muted mb-1">
            {settled ? t("explain.settledResult") : net < 0 ? t("explain.owesResult") : t("explain.owedResult")}
          </div>
          <div className="font-mono font-bold text-2xl" style={{ color: settled ? "var(--muted)" : net < 0 ? "#D14444" : "#0A8B5E" }}>
            {settled ? t("bal.uptodate") : money(Math.abs(net))}
          </div>
        </div>

        <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift mt-4 w-full inline-flex items-center justify-center gap-1.5">
          <Icon name="check" size={15} /> {t("common.close")}
        </button>
      </div>
    </Overlay>
  );
}
