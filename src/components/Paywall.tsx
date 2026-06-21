import { useState } from "react";
import { redeemCode } from "../lib/plan";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

const FEATURES = ["paywall.f1", "paywall.f2", "paywall.f3", "paywall.f4"];

export function Paywall({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function redeem() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const res = await redeemCode(code);
    setBusy(false);
    if (res.ok) {
      setOk(true);
      setTimeout(onClose, 1100);
    } else {
      const map: Record<string, string> = {
        invalid: "code.err.invalid",
        expired: "code.err.expired",
        exhausted: "code.err.exhausted",
        not_authenticated: "code.err.auth",
        network: "code.err.network",
        empty: "code.err.invalid",
      };
      setErr(t(map[res.error ?? "invalid"] ?? "code.err.invalid"));
    }
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

        {ok ? (
          <div
            className="rounded-2xl p-4 text-center font-semibold"
            style={{ background: "rgba(10,139,94,0.12)", color: "#0A8B5E" }}
          >
            {t("code.success")}
          </div>
        ) : (
          <>
            <div className="rounded-2xl p-3 mb-3 text-center" style={{ background: "var(--glass)" }}>
              <div className="text-xs text-muted">{t("paywall.betaNote")}</div>
            </div>

            <label className="text-xs font-semibold text-muted">{t("code.label")}</label>
            <div className="flex gap-2 mt-1">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && redeem()}
                placeholder={t("code.placeholder")}
                autoCapitalize="characters"
                className="glass rounded-xl px-3 py-2.5 text-sm flex-1 font-mono uppercase"
              />
              <button
                onClick={redeem}
                disabled={!code.trim() || busy}
                className="rounded-full px-5 py-2.5 font-semibold text-white hover-lift disabled:opacity-50 shrink-0"
                style={{ background: "var(--ink)" }}
              >
                {busy ? t("code.redeeming") : t("code.redeem")}
              </button>
            </div>
            {err && <p className="text-red-500 text-xs mt-2">{err}</p>}

            <p className="text-[11px] text-muted text-center mt-4">{t("paywall.priceNote")}</p>
          </>
        )}
      </div>
    </Overlay>
  );
}
