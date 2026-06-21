import { activatePro } from "../lib/plan";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

const FEATURES = ["paywall.f1", "paywall.f2", "paywall.f3", "paywall.f4"];

export function Paywall({ onClose }: { onClose: () => void }) {
  const t = useT();

  function startTrial() {
    // TODO(backend): launch Stripe Checkout (7-day trial, card required) and set
    // the plan from the Supabase subscription. For now activate locally so the
    // Pro experience is testable end-to-end.
    activatePro();
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2">
            <span
              className="h-9 w-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(91,91,240,0.15)", color: "var(--indigo)" }}
            >
              <Icon name="sparkles" size={18} />
            </span>
            <h3 className="font-display text-xl font-bold">{t("paywall.title")}</h3>
          </div>
          <button
            onClick={onClose}
            className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <p className="text-sm text-muted mb-4">{t("paywall.subtitle")}</p>

        <div className="space-y-2.5 mb-5">
          {FEATURES.map((k) => (
            <div key={k} className="flex items-start gap-2.5 text-sm">
              <Icon name="check" size={16} style={{ color: "var(--teal)", flex: "0 0 auto", marginTop: 2 }} />
              <span>{t(k)}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-3 mb-4 text-center" style={{ background: "var(--glass)" }}>
          <div className="font-display text-2xl font-bold">
            $60<span className="text-sm font-normal text-muted">/{t("paywall.year")}</span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {t("paywall.or")} $7/{t("paywall.month")}
          </div>
        </div>

        <button
          onClick={startTrial}
          className="w-full rounded-full py-3 font-semibold text-white hover-lift"
          style={{ background: "var(--ink)" }}
        >
          {t("paywall.cta")}
        </button>
        <p className="text-[11px] text-muted text-center mt-2.5">{t("paywall.terms")}</p>
      </div>
    </Overlay>
  );
}
