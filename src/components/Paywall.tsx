import { useState, useEffect } from "react";
import { redeemCode, startCheckout, reloadPlan, isNativePlatform } from "../lib/plan";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

const FEATURES = ["paywall.f1", "paywall.f2", "paywall.f3", "paywall.f4"];

export function Paywall({ onClose, reason }: { onClose: () => void; reason?: string }) {
  const t = useT();
  // Guideline 3.1.1: en la app EMPAQUETADA (iOS/Android) no se puede desbloquear
  // funcionalidad de pago con nada que no sea IAP — ni checkout externo, ni
  // canje de código, ni enlaces/menciones a comprar fuera. Modelo multiplataforma
  // (como Notion/Trello): Pro se activa solo si la cuenta YA es Pro (comprada en
  // la web); en nativo el paywall solo informa, sin ningún mecanismo de compra.
  const native = isNativePlatform();
  const [billing, setBilling] = useState<"annual" | "monthly">("annual");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  // Handle ?upgraded=1 param after Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      reloadPlan().then(() => {
        window.history.replaceState({}, "", window.location.pathname);
        onClose();
      });
    }
  }, []);

  async function handleCheckout() {
    if (redirecting) return;
    setRedirecting(true);
    setErr(null);
    const error = await startCheckout(billing);
    if (error) {
      setRedirecting(false);
      setErr(error === "not_authenticated" ? t("paywall.needsLogin") : t("paywall.checkoutError"));
    }
    // On success the page navigates away; no need to reset redirecting
  }

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
            <h3 className="font-display text-xl font-bold">{native ? t("paywall.nativeTitle") : t("paywall.title")}</h3>
          </div>
          <button
            onClick={onClose}
            className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {reason && (
          <div
            className="rounded-2xl p-3 mb-3 text-sm font-medium"
            style={{ background: "rgba(91,91,240,0.1)", color: "var(--indigo)" }}
          >
            {reason}
          </div>
        )}

        {/* Web: subtítulo de venta. Nativo: etiqueta neutra "Pro incluye"
            (informativa, estilo Spotify), sin verbos de compra ni precio. */}
        {native ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 mt-1">{t("paywall.proIncludes")}</p>
        ) : (
          <p className="text-sm text-muted mb-4">{t("paywall.subtitle")}</p>
        )}
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
            {native ? null : (
              <>
                {/* Billing toggle */}
                <div className="flex rounded-2xl overflow-hidden mb-4" style={{ background: "var(--glass)" }}>
                  {(["annual", "monthly"] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBilling(b)}
                      className="flex-1 py-2.5 text-sm font-semibold transition-all"
                      style={billing === b
                        ? { background: "var(--indigo)", color: "#fff", borderRadius: "1rem" }
                        : { color: "var(--muted)" }
                      }
                    >
                      {b === "annual"
                        ? `$5/${t("paywall.month")} · ${t("paywall.annualSave")}`
                        : `$7/${t("paywall.month")}`}
                    </button>
                  ))}
                </div>

                {billing === "annual" && (
                  <p className="text-xs text-center text-muted mb-3">{t("paywall.billedAnnually")}</p>
                )}

                <button
                  onClick={handleCheckout}
                  disabled={redirecting}
                  className="w-full rounded-2xl py-3.5 font-semibold text-white hover-lift disabled:opacity-60 mb-2"
                  style={{ background: "linear-gradient(135deg, var(--indigo), var(--teal))" }}
                >
                  {redirecting ? t("paywall.redirecting") : t("paywall.cta")}
                </button>

                <p className="text-[11px] text-muted text-center mb-4">{t("paywall.terms")}</p>

                {err && <p className="text-red-500 text-xs text-center mb-3">{err}</p>}
              </>
            )}

            {/* En nativo: nota neutra, sin compra ni código (guideline 3.1.1) */}
            {native && (
              <p className="text-sm text-muted text-center py-2">{t("paywall.nativeNote")}</p>
            )}

            {/* Divider + access code section (solo web) */}
            {!native && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px" style={{ background: "var(--glass)" }} />
                <button
                  onClick={() => setShowCode(!showCode)}
                  className="text-xs text-muted"
                >
                  {t("paywall.betaNote")}
                </button>
                <div className="flex-1 h-px" style={{ background: "var(--glass)" }} />
              </div>
            )}

            {showCode && !native && (
              <>
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
              </>
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}
