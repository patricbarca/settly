import { useState } from "react";
import { signInEmail, signInGoogle, verifyOtp, useAuthPhase, useOtpEmail } from "../lib/auth";
import { useLang, setLang, useT } from "../lib/i18n";
import { useTheme, toggleTheme } from "../lib/theme";
import { Logo } from "./Logo";
import { Icon } from "./Icon";

export function Login() {
  const t = useT();
  const lang = useLang();
  const theme = useTheme();
  const phase = useAuthPhase();
  const otpEmail = useOtpEmail();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      await signInEmail(mode === "signup" ? name : "", email);
    } catch (e: any) {
      setError(e.message ?? "Error al enviar el código");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (otp.length < 6 || !otpEmail || loading) return;
    setLoading(true);
    setError("");
    try {
      await verifyOtp(otpEmail, otp.trim());
    } catch {
      setError("Código incorrecto. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!otpEmail || loading) return;
    setLoading(true);
    setError("");
    setOtp("");
    try {
      await signInEmail("", otpEmail);
    } catch (e: any) {
      setError(e.message ?? "Error al reenviar");
    } finally {
      setLoading(false);
    }
  }

  const Controls = () => (
    <div className="flex justify-end gap-2 mb-3">
      <button
        onClick={toggleTheme}
        className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift"
        title={theme === "dark" ? "Light" : "Dark"}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
      </button>
      <div className="glass rounded-full p-0.5 flex text-xs font-semibold">
        {(["es", "en"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-2.5 py-1 rounded-full ${lang === l ? "" : "text-muted"}`}
            style={lang === l ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );

  if (phase === "otp_sent" && otpEmail) {
    return (
      <div className="min-h-full flex flex-col">
        <div className="max-w-md w-full mx-auto px-4 flex flex-col pt-10 pb-8">
          <Controls />
          <div className="glass-strong rounded-3xl p-6 anim-up">
            <div className="text-4xl mb-3 text-center">📬</div>
            <h2 className="font-display text-2xl font-bold mb-1 text-center">{t("login.checkEmail")}</h2>
            <p className="text-sm text-muted mb-5 text-center">
              {t("login.otpSent")} <strong>{otpEmail}</strong>
            </p>
            <input
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder={t("login.otpPlaceholder")}
              inputMode="numeric"
              className="glass rounded-xl px-3 py-3 w-full text-center text-3xl tracking-[0.5em] font-mono mb-3"
            />
            {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}
            <button
              onClick={verify}
              disabled={otp.length < 6 || loading}
              className="w-full rounded-full px-4 py-3 font-semibold text-white hover-lift disabled:opacity-50"
              style={{ background: "var(--ink)" }}
            >
              {loading ? t("login.verifying") : t("login.verify")}
            </button>
            <button onClick={resend} disabled={loading} className="lk text-sm w-full text-center mt-3">
              {loading ? t("login.sending") : t("login.resend")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="max-w-md w-full mx-auto px-4 flex-1 flex flex-col justify-center py-8">
        <Controls />

        <div className="hero anim-up">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <div className="relative z-10 flex flex-col items-center text-center py-2">
            <div className="glass rounded-3xl p-3 mb-3">
              <Logo size={48} />
            </div>
            <h1 className="text-white font-display text-4xl font-extrabold">Settly</h1>
            <p className="text-white/85 text-sm mt-2 max-w-xs">{t("login.tagline")}</p>
          </div>
        </div>

        <div className="glass-strong rounded-3xl p-6 mt-4 anim-up">
          <p className="text-sm text-muted mb-4">{t("login.subtitle")}</p>

          <button
            onClick={signInGoogle}
            className="w-full rounded-full px-4 py-3 font-medium flex items-center justify-center gap-2 hover-lift"
            style={{ background: "#fff", color: "#1a1c22", border: "1px solid #e2e4de" }}
          >
            <GoogleIcon />
            {t("login.google")}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1" style={{ background: "var(--line)" }} />
            <span className="text-xs text-muted">{t("login.or")}</span>
            <div className="h-px flex-1" style={{ background: "var(--line)" }} />
          </div>

          <div className="space-y-2.5">
            {mode === "signup" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("login.name")}
                className="glass rounded-xl px-3 py-2.5 text-sm w-full"
              />
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("login.email")}
              type="email"
              className="glass rounded-xl px-3 py-2.5 text-sm w-full"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              onClick={submit}
              disabled={!email.trim() || loading}
              className="w-full rounded-full px-4 py-3 font-semibold text-white hover-lift disabled:opacity-50"
              style={{ background: "var(--ink)" }}
            >
              {loading ? t("login.sending") : mode === "signup" ? t("login.signup") : t("login.signin")}
            </button>
          </div>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="lk text-sm w-full text-center mt-3"
          >
            {mode === "signin" ? t("login.noAccount") : t("login.haveAccount")}
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 36 44 30.7 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
