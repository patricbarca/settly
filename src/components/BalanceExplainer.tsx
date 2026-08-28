import { useState } from "react";
import type { Group } from "../lib/types";
import { shareFor } from "../lib/split";
import { displayName } from "../lib/format";
import { useGroupMoney } from "../lib/displayCurrency";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** Explica CÓMO se llega al saldo de un miembro: su parte de cada gasto, lo que
 *  pagó por el grupo, y los pagos que hizo/recibió → saldo final. Cada concepto
 *  tiene un botón "i" que explica qué es. Reactivo: recalcula del estado del
 *  grupo (se re-renderiza con cada pago). No guarda nada. */
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
  const [openHelp, setOpenHelp] = useState<string | null>(null);
  const ids = group.members.map((m) => m.id);
  const me = group.members.find((m) => m.id === memberId);
  const settles = (s: { status: string }) => s.status === "confirmed" || s.status === "pending";

  // Parte de cada gasto en el que participa.
  const rows = group.expenses
    .map((e) => ({
      label: e.label,
      n: (e.participantIds?.length ? e.participantIds.length : ids.length) || 1,
      share: shareFor(e, ids)[memberId] || 0,
    }))
    .filter((x) => x.share > 0.005);
  const totalShare = Math.round(rows.reduce((s, x) => s + x.share, 0) * 100) / 100;

  // Lo que puso de su bolsillo (adelantó) en los gastos.
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

  // Botón "i" que despliega la ayuda de ese concepto.
  const HelpBtn = ({ k }: { k: string }) => (
    <button
      onClick={() => setOpenHelp((v) => (v === k ? null : k))}
      className="h-4 w-4 rounded-full flex items-center justify-center text-muted shrink-0"
      style={{ border: "1px solid var(--line)" }}
      aria-label={t("common.info")}
    >
      <Icon name="help" size={10} />
    </button>
  );
  const HelpText = ({ k, text }: { k: string; text: string }) =>
    openHelp === k ? <p className="text-xs text-muted mt-1 leading-snug">{text}</p> : null;

  // Fila de ajuste (label + botón i + monto), con su ayuda debajo.
  const Line = ({ k, label, value, sign, help }: { k: string; label: string; value: number; sign: "+" | "-"; help: string }) => (
    <div className="py-1">
      <div className="flex items-center justify-between text-sm gap-2">
        <span className="flex items-center gap-1.5 text-muted min-w-0">
          <span className="truncate">{label}</span>
          <HelpBtn k={k} />
        </span>
        <span className="font-mono shrink-0">{sign === "-" ? "−" : "+"}{money(value)}</span>
      </div>
      <HelpText k={k} text={help} />
    </div>
  );

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-4">
          {t("explain.title", { name: me ? displayName(me) : "?" })}
        </h3>

        {/* Parte de los gastos */}
        <div className="glass rounded-2xl p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px] uppercase tracking-wide font-mono text-muted">{t("explain.share")}</span>
            <HelpBtn k="share" />
          </div>
          <HelpText k="share" text={t("explain.help.share")} />
          <div className="space-y-1 mt-1">
            {rows.length === 0 ? (
              <div className="text-sm text-muted">—</div>
            ) : (
              rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-[10px] font-mono text-muted rounded-full px-1.5 py-0.5 leading-none"
                      style={{ background: "var(--glass)" }}
                      title={t("explain.splitAmong", { n: r.n })}
                    >
                      ÷{r.n}
                    </span>
                    <span className="font-mono">{money(r.share)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between text-sm font-semibold border-t mt-2 pt-2" style={{ borderColor: "var(--line)" }}>
            <span>{t("explain.shareTotal")}</span>
            <span className="font-mono">{money(totalShare)}</span>
          </div>
        </div>

        {/* Ajustes: cada uno con su botón "i" */}
        <div className="glass rounded-2xl p-3 mb-3">
          {fronted > 0.005 && <Line k="fronted" label={t("explain.fronted")} value={fronted} sign="+" help={t("explain.help.fronted")} />}
          {paymentsMade > 0.005 && <Line k="made" label={t("explain.paymentsMade")} value={paymentsMade} sign="+" help={t("explain.help.made")} />}
          {paymentsReceived > 0.005 && <Line k="received" label={t("explain.paymentsReceived")} value={paymentsReceived} sign="-" help={t("explain.help.received")} />}
          <Line k="shareOwed" label={t("explain.shareOwed")} value={totalShare} sign="-" help={t("explain.help.share")} />
        </div>

        {/* Resultado */}
        <div
          className="rounded-2xl p-4 text-center"
          style={{ background: settled ? "var(--glass)" : net < 0 ? "rgba(209,68,68,0.12)" : "rgba(10,139,94,0.12)" }}
        >
          <div className="text-xs text-muted mb-1 inline-flex items-center gap-1.5">
            {settled ? t("explain.settledResult") : net < 0 ? t("explain.owesResult") : t("explain.owedResult")}
            <HelpBtn k="result" />
          </div>
          <HelpText k="result" text={t("explain.help.result")} />
          <div className="font-mono font-bold text-2xl mt-1" style={{ color: settled ? "var(--muted)" : net < 0 ? "#D14444" : "#0A8B5E" }}>
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
