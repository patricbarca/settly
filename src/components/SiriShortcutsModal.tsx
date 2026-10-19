import { useEffect, useState } from "react";
import { getPaymentPrefs, setPaymentPrefs, type PaymentPrefs, type MerchantRef } from "../lib/walletPrefs";
import { decimalInput } from "../lib/format";
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

              <PaymentPrefsCard />

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

              {/* Lo que falla en la práctica: se abre la app Atajos en vez de ir solo. */}
              <div className="rounded-2xl p-3" style={{ background: "rgba(232,146,12,0.12)" }}>
                <div className="text-sm font-semibold">{t("siriFix.title")}</div>
                <ol className="list-decimal pl-4 mt-1.5 space-y-1 text-xs leading-relaxed">
                  <li>{t("siriFix.one")}</li>
                  <li>{t("siriFix.two")}</li>
                  <li>{t("siriFix.three")}</li>
                </ol>
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

/** Ajustes de "Preguntar por un pago": importe mínimo y comercios que van
 *  solos a Personal o que nunca preguntan. Viven en el App Group (los lee la
 *  acción nativa sin la web cargada). */
function PaymentPrefsCard() {
  const t = useT();
  const [p, setP] = useState<PaymentPrefs | null | undefined>(undefined);
  const [min, setMin] = useState("");
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
