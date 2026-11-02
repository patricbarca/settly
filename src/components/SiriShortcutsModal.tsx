import { useEffect, useState } from "react";
import { getPaymentPrefs, setPaymentPrefs, enableInboxMode, disableInboxMode, type PaymentPrefs, type MerchantRef } from "../lib/walletPrefs";
import { decimalInput } from "../lib/format";
import { createPortal } from "react-dom";
import { useT, useLang } from "../lib/i18n";
import { Icon } from "./Icon";

// "Siri y Atajos": lo que la app expone a iOS (ios/App/App/SettliaIntents.swift)
// y cómo montar la automatización de Wallet. Solo se muestra en la app nativa
// de iPhone; en web/Android no aplica.
//
// Por qué hay DOS caminos: Apple no deja compartir ni instalar automatizaciones
// (cada usuario la crea a mano). Lo único compartible es un atajo normal, pero
// un atajo suelto no sabe que le llega un pago, así que no puede pasar el
// comercio ni el importe. Por eso: enlace = rápido pero hay que escribir el
// gasto; guía = 2 minutos y lo rellena solo.


// En Capacitor, navegar a un host externo o a otro esquema lo abre el sistema
// (Safari / la app Atajos), no el WebView.
function openExternal(url: string) {
  window.location.href = url;
}

function CopyChip({ text }: { text: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }).catch(() => {});
      }}
      className="inline-flex items-center gap-1.5 rounded-xl glass px-2.5 py-1 text-xs font-semibold hover-lift max-w-full"
      title={t("common.copy")}
    >
      <span className="truncate">{text}</span>
      <Icon name={done ? "check" : "copy"} size={12} className="shrink-0 text-muted" />
    </button>
  );
}

export function SiriShortcutsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  if (typeof document === "undefined") return null;

  const steps: { text: string; copy?: string[] }[] = [
    { text: t("siri.step1") },
    { text: t("siri.step2") },
    { text: t("siri.step3") },
    { text: t("siri.step4"), copy: ["Settlia"] },
    { text: t("siri.step5") },
    { text: t("siri.step6") },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-30 flex flex-col anim-up"
      style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <button
            onClick={onClose}
            className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted hover-lift"
            title={t("common.back")}
          >
            <Icon name="back" size={16} />
          </button>
          <h2 className="font-display text-2xl font-bold">{t("siri.title")}</h2>
        </div>

        <div
          className="flex-1 overflow-y-auto space-y-5"
          style={{ paddingBottom: "calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 24px)" }}
        >
          <div>
            <div className="text-xs uppercase tracking-widest font-mono text-muted mb-2">{t("siri.walletTitle")}</div>
            <div className="glass rounded-3xl p-4 space-y-3">
                <button
                  onClick={() => openExternal("shortcuts://")}
                  className="w-full rounded-2xl py-3.5 text-base font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: "var(--teal)" }}
                >
                  {t("siri.openShortcuts")} <Icon name="external" size={14} />
                </button>

              <div className="rounded-2xl p-3" style={{ background: "rgba(15,163,163,0.10)" }}>
                <div className="text-sm font-semibold mb-1">{t("siri.guideTitle")}</div>
                <iframe
                  src={`/guides/wallet-automation.html?lang=${lang}`}
                  title={t("siri.guideTitle")}
                  className="w-full my-2 border-0"
                  style={{ height: 760, background: "transparent" }}
                />
                <p className="text-xs text-muted mb-2 leading-relaxed">{t("siri.manualNote")}</p>
                <ol className="space-y-2.5 mt-2">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span
                        className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5"
                        style={{ background: "var(--teal)", color: "#fff" }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 text-sm leading-relaxed">
                        {s.text}
                        {s.copy && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {s.copy.map((c) => <CopyChip key={c} text={c} />)}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <PaymentPrefsCard />

              <p className="text-xs text-muted leading-relaxed">{t("siri.applePayOnly")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Ajustes de "Preguntar por un pago": importe mínimo y comercios que van
 *  solos a Personal o que nunca preguntan. Viven en el App Group (los lee la
 *  acción nativa sin la web cargada). */
function PaymentPrefsCard() {
  const t = useT();
  const [p, setP] = useState<PaymentPrefs | null | undefined>(undefined);
  const [min, setMin] = useState("");
  const [modeBusy, setModeBusy] = useState(false);
  const [modeErr, setModeErr] = useState(false);
  useEffect(() => {
    void getPaymentPrefs().then((r) => {
      setP(r);
      if (r) setMin(r.minAmount ? String(r.minAmount) : "");
    });
  }, []);
  if (p === undefined) return null;
  if (p === null) {
    return <p className="text-xs text-muted">{t("pp.oldBuild")}</p>;
  }
  const save = (next: Partial<PaymentPrefs>) => {
    setP({ ...p, ...next });
    void setPaymentPrefs(next);
  };
  const List = ({ field, title, hint }: { field: "personal" | "ignored"; title: string; hint: string }) => (
    <div>
      <div className="text-xs font-semibold text-muted">{title}</div>
      {p[field].length === 0 ? (
        <div className="text-xs text-muted mt-1">{t("pp.none")}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {p[field].map((m: MerchantRef) => (
            <button
              key={m.key}
              onClick={() => save({ [field]: p[field].filter((x) => x.key !== m.key) } as Partial<PaymentPrefs>)}
              className="inline-flex items-center gap-1.5 rounded-xl glass px-2.5 py-1 text-xs font-semibold hover-lift"
              title={t("pp.remove")}
            >
              {m.name || m.key} <Icon name="close" size={11} className="text-muted" />
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted mt-1 leading-snug">{hint}</p>
    </div>
  );
  return (
    <div className="rounded-2xl p-3 glass space-y-3">
      <div className="text-sm font-semibold">{t("pp.title")}</div>
      {p.notifications === false && (
        <p className="text-xs rounded-xl px-2.5 py-2" style={{ background: "rgba(255,90,77,0.12)", color: "var(--coral)" }}>
          {t("pp.notifOff")}
        </p>
      )}
      <div>
        <div className="text-xs font-semibold text-muted">{t("pp.mode")}</div>
        <div className="grid grid-cols-2 gap-2 mt-1.5" role="radiogroup">
          {(["ask", "inbox"] as const).map((m) => {
            const on = (p.mode ?? "ask") === m;
            return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={modeBusy}
              onClick={async () => {
                if ((p.mode ?? "ask") === m) return;
                setModeBusy(true);
                setModeErr(false);
                if (m === "inbox") {
                  const ok = await enableInboxMode(p.digestHour ?? 20);
                  if (ok) setP({ ...p, mode: "inbox", digestHour: p.digestHour ?? 20 });
                  else setModeErr(true);
                } else {
                  await disableInboxMode();
                  setP({ ...p, mode: "ask" });
                }
                setModeBusy(false);
              }}
              className="rounded-2xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2 text-left leading-tight transition-colors"
              style={{
                border: `2px solid ${on ? "var(--teal)" : "var(--line)"}`,
                background: on ? "rgba(15,163,163,0.16)" : "transparent",
                color: on ? "var(--ink)" : "var(--muted)",
              }}
            >
              <span
                className="h-4 w-4 rounded-full shrink-0 flex items-center justify-center"
                style={{ border: `2px solid ${on ? "var(--teal)" : "var(--muted)"}` }}
              >
                {on && <span className="h-2 w-2 rounded-full" style={{ background: "var(--teal)" }} />}
              </span>
              {m === "ask" ? t("pp.modeAsk") : t("pp.modeInbox")}
            </button>
            );
          })}
        </div>
        {modeErr && <p className="text-xs mt-1" style={{ color: "var(--coral)" }}>{t("pp.modeError")}</p>}
        {p.mode === "inbox" && (
          <>
            <p className="text-[11px] text-muted mt-1.5 leading-snug">{t("pp.modeInboxHint")}</p>
            <label className="flex items-center gap-2 mt-2 text-xs font-semibold text-muted">
              {t("pp.digestAt")}
              <select
                value={p.digestHour ?? 20}
                onChange={(e) => save({ digestHour: Number(e.target.value) })}
                className="glass rounded-xl px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">{t("pp.min")}</label>
        <div className="flex items-center gap-2 mt-1">
          <input
            value={min}
            onChange={(e) => {
              const v = decimalInput(e.target.value);
              setMin(v);
              void setPaymentPrefs({ minAmount: Number(v) || 0 });
            }}
            inputMode="decimal"
            placeholder="0"
            className="glass rounded-xl px-3 py-2 text-sm w-28 font-mono"
          />
        </div>
        <p className="text-[11px] text-muted mt-1 leading-snug">{t("pp.minHint")}</p>
      </div>
      <List field="personal" title={t("pp.personal")} hint={t("pp.personalHint")} />
      <List field="ignored" title={t("pp.ignored")} hint={t("pp.ignoredHint")} />
    </div>
  );
}
