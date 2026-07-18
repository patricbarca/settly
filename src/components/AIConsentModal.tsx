import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

// Divulgación + permiso antes de enviar datos a la IA de terceros (Apple
// 5.1.1(i)/5.1.2(i)): qué se envía, a quién, y para qué. Se muestra una sola vez
// (la decisión se guarda). Sin aceptar, no se envía nada.
export function AIConsentModal({ onDecide }: { onDecide: (accepted: boolean) => void }) {
  const t = useT();
  return (
    <Overlay onClose={() => onDecide(false)}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(91,91,240,0.15)", color: "var(--indigo)" }}>
            <Icon name="sparkles" size={18} />
          </span>
          <h3 className="font-display text-xl font-bold">{t("aiConsent.title")}</h3>
        </div>

        <p className="text-sm text-muted mb-3">{t("aiConsent.intro")}</p>

        <div className="glass rounded-2xl p-3 space-y-2 mb-3 text-sm">
          <div className="flex items-start gap-2">
            <Icon name="camera" size={15} className="text-muted shrink-0 mt-0.5" />
            <span>{t("aiConsent.what")}</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="external" size={15} className="text-muted shrink-0 mt-0.5" />
            <span>{t("aiConsent.who")}</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="check" size={15} className="text-muted shrink-0 mt-0.5" />
            <span>{t("aiConsent.purpose")}</span>
          </div>
        </div>

        <p className="text-[11px] text-muted mb-4">{t("aiConsent.privacy")}</p>

        <div className="flex gap-2">
          <button
            onClick={() => onDecide(true)}
            className="flex-1 rounded-full py-3 font-semibold text-white hover-lift"
            style={{ background: "linear-gradient(135deg, var(--indigo), var(--teal))" }}
          >
            {t("aiConsent.accept")}
          </button>
          <button onClick={() => onDecide(false)} className="glass rounded-full px-5 py-3 text-muted hover-lift">
            {t("aiConsent.decline")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
