import { useState } from "react";
import type { Group, PayMethod } from "../lib/types";
import { memberPays, payLink } from "../lib/pay";
import { money } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** Hoja que se abre al pulsar "Pagar": muestra SOLO los métodos del cobrador
 *  (no se ven en el listado), con copia directa por tipo y enlace de pago
 *  cuando el método lo soporta (PayPal, Wise, Revolut, bunq…). */
export function PaySheet({
  group,
  to,
  amount,
  onClose,
}: {
  group: Group;
  to: string;
  amount: number;
  onClose: () => void;
}) {
  const t = useT();
  const payee = group.members.find((m) => m.id === to);
  const methods = memberPays(payee);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(key: string, value: string) {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  }

  // Filas a copiar para un método (transferencia = BSB + cuenta por separado).
  function rows(pm: PayMethod): { label: string; value: string }[] {
    if (pm.type === "bank") {
      const out: { label: string; value: string }[] = [];
      if (pm.value?.trim()) out.push({ label: t("pay.bank.bsb"), value: pm.value.trim() });
      if (pm.value2?.trim()) out.push({ label: t("pay.bank.account"), value: pm.value2.trim() });
      return out;
    }
    return [{ label: t(`pay.label.${pm.type}`), value: pm.value.trim() }];
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-1">{t("pay.pay")}</h3>
        <p className="text-sm text-muted mb-4">
          {t("pay.toPerson", { amt: money(amount, group.currency), name: payee?.name ?? "" })}
        </p>

        {methods.length === 0 ? (
          <p className="text-sm text-muted py-4">{t("pay.noMethod", { name: payee?.name ?? "" })}</p>
        ) : (
          <div className="space-y-3">
            {methods.map((pm, i) => {
              const link = payLink(pm, amount);
              return (
                <div key={i} className="glass rounded-2xl p-3">
                  <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">
                    {t(`pay.label.${pm.type}`)}
                  </div>
                  <div className="space-y-1.5">
                    {rows(pm).map((r, k) => {
                      const key = `${i}-${k}`;
                      return (
                        <button
                          key={k}
                          onClick={() => copy(key, r.value)}
                          className="w-full flex items-center gap-2 text-left hover-lift glass rounded-xl px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] text-muted">{r.label}</span>
                            <span className="block font-mono text-sm truncate">{r.value}</span>
                          </span>
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted">
                            {copied === key ? (
                              <>
                                <Icon name="check" size={14} style={{ color: "#0A8B5E" }} /> {t("pay.copied.short")}
                              </>
                            ) : (
                              <>
                                <Icon name="copy" size={14} /> {t("pay.copy")}
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white hover-lift w-full"
                      style={{ background: "var(--teal)" }}
                    >
                      <Icon name="external" size={15} /> {t("pay.payVia", { name: t(`pay.label.${pm.type}`) })}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift mt-4 w-full">
          {t("common.close")}
        </button>
      </div>
    </Overlay>
  );
}
