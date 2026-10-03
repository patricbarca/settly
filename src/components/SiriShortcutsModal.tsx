import { useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
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

/** Atajo "Settlia: ¿compartido?" (menú escanear / sin ticket), compartido por iCloud. */
const SHORTCUT_URL = "https://www.icloud.com/shortcuts/f75f782c369446349bad0f68960aa130";

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
  if (typeof document === "undefined") return null;

  const steps: { text: string; copy?: string[] }[] = [
    { text: t("siri.step1") },
    { text: t("siri.step2") },
    { text: t("siri.step3") },
    { text: t("siri.step4"), copy: [t("siri.menuPrompt"), t("siri.menuScan"), t("siri.menuNoReceipt")] },
    { text: t("siri.step5") },
    { text: t("siri.step6") },
    { text: t("siri.step7") },
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
          {/* Frases de Siri */}
          <div>
            <div className="text-xs uppercase tracking-widest font-mono text-muted mb-2">{t("siri.phrasesTitle")}</div>
            <div className="glass rounded-3xl p-4 space-y-2">
              <p className="text-sm text-muted">{t("siri.phrasesHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                <CopyChip text={t("siri.phraseAdd")} />
                <CopyChip text={t("siri.phraseScan")} />
              </div>
            </div>
          </div>

          {/* Al pagar con Apple Pay */}
          <div>
            <div className="text-xs uppercase tracking-widest font-mono text-muted mb-2">{t("siri.walletTitle")}</div>
            <div className="glass rounded-3xl p-4 space-y-3">
              <p className="text-sm text-muted">{t("siri.walletIntro")}</p>

              <div className="rounded-2xl p-3" style={{ background: "rgba(15,163,163,0.10)" }}>
                <div className="text-sm font-semibold mb-1">{t("siri.guideTitle")}</div>
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
                <button
                  onClick={() => openExternal("shortcuts://")}
                  className="mt-3 w-full rounded-2xl py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: "var(--teal)" }}
                >
                  {t("siri.openShortcuts")} <Icon name="external" size={14} />
                </button>
              </div>

              <div className="rounded-2xl p-3 glass">
                <div className="text-sm font-semibold">{t("siri.linkTitle")}</div>
                <p className="text-xs text-muted mt-1 leading-relaxed">{t("siri.linkBody")}</p>
                <button
                  onClick={() => openExternal(SHORTCUT_URL)}
                  className="mt-2.5 w-full rounded-2xl py-2.5 text-sm font-semibold glass flex items-center justify-center gap-2 hover-lift"
                >
                  {t("siri.installShortcut")} <Icon name="external" size={14} />
                </button>
              </div>

              <p className="text-xs text-muted leading-relaxed">{t("siri.applePayOnly")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
