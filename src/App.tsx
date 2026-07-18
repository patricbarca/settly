import { useEffect, useState } from "react";
import { useUser, useAuthPhase, setProfileName, submitPhone, verifyPhone, skipPhone, usePendingPhone } from "./lib/auth";
import { useLang, setLang, useT } from "./lib/i18n";
import { resetSeed, useActiveGroup, loadGuestMode, setActiveGroup, addGroup, useGroups } from "./lib/store";
import { useTheme, toggleTheme } from "./lib/theme";
import { joinByToken, getJoinPreview } from "./lib/invite";
import { ClaimMemberModal } from "./components/ClaimMemberModal";
import { Icon } from "./components/Icon";
import { Login } from "./components/Login";
import { Home, type HomeTab } from "./components/Home";
import { GroupView } from "./components/GroupView";
import { Logo } from "./components/Logo";
import { OnboardingModal } from "./components/OnboardingModal";
import { OfflineBanner } from "./components/OfflineBanner";
import { AccountModal } from "./components/AccountModal";
import { FaqModal } from "./components/FaqModal";
import { NotificationsBell } from "./components/NotificationsBell";
import { BottomNav, type NavKey } from "./components/BottomNav";
import { countUnread } from "./lib/notifications";
import { refreshNativePush } from "./lib/nativePush";
import { FeedbackModal } from "./components/FeedbackModal";
import { AIConsentModal } from "./components/AIConsentModal";
import { registerAIConsentOpener, resolveAIConsent } from "./lib/aiConsent";
import { registerAppOpen, shouldShowFeedbackPrompt, markFeedbackPromptShown } from "./lib/feedbackPrompt";
import { AdminDashboard } from "./components/AdminDashboard";

const ADMIN_EMAIL = "paabarcad@gmail.com";

export default function App() {
  const user = useUser();
  const phase = useAuthPhase();
  const t = useT();
  const lang = useLang();
  const theme = useTheme();
  const group = useActiveGroup();
  const allGroups = useGroups();
  const [showOnboarding, setShowOnboarding] = useState(false);
  // true = primera vez en la historia del usuario (no se puede saltar, hay
  // que verlo completo); false = reabierto a mano con el botón "?" (libre).
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAIConsent, setShowAIConsent] = useState(false);
  const [joinPreview, setJoinPreview] = useState<{
    token: string;
    groupName: string;
    unclaimed: { id: string; name: string }[];
  } | null>(null);
  const [homeTab, setHomeTab] = useState<HomeTab>("groups");
  const unread = countUnread(allGroups);
  const navActive: NavKey = showActivity
    ? "activity"
    : showAccount
    ? "profile"
    : homeTab === "contacts" && !group
    ? "friends"
    : "groups";
  // La pantalla de carga se ve al menos 3s (evita un parpadeo si la sesión
  // resuelve casi al instante, p. ej. con Supabase cacheado).
  const [minLoadDone, setMinLoadDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinLoadDone(true), 3000);
    return () => clearTimeout(id);
  }, []);

  // Abre el modal de consentimiento de IA cuando alguna función lo requiere.
  useEffect(() => {
    registerAIConsentOpener(() => setShowAIConsent(true));
    return () => registerAIConsentOpener(null);
  }, []);
  const showLoading = phase === "loading" || !minLoadDone;

  // theme-color (tiñe la barra de estado/navegador) sigue siempre al tema
  // día/noche — excepto durante el splash de carga, que fuerza su navy fijo.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", showLoading ? "#0D1B2A" : theme === "dark" ? "#0D0F14" : "#EDF0EB");
  }, [showLoading, theme]);

  // El splash es `fixed inset-0`, pero en iOS un desajuste entre el viewport
  // visual y el real puede dejar un resquicio del fondo blanco por defecto de
  // <html> asomando en un borde. Mientras dura, forzamos ese fondo a navy
  // también para que no se note ningún hueco.
  useEffect(() => {
    document.documentElement.style.background = showLoading ? "#0D1B2A" : "";
  }, [showLoading]);

  // La franja fija que tapa el notch/barra de estado (ver index.css) usa el
  // color del tema — durante el splash (fondo navy fijo, sin tema aún) se
  // ocultaría mal (blanco/gris sobre navy), así que se apaga mientras dure.
  useEffect(() => {
    document.body.classList.toggle("splash-active", showLoading);
  }, [showLoading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("join");
    if (token) {
      sessionStorage.setItem("settly.pendingJoin", token);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (phase === "guest") loadGuestMode();
  }, [phase]);

  useEffect(() => {
    if (phase !== "authenticated" || !user) return;
    const token = sessionStorage.getItem("settly.pendingJoin");
    if (!token) return;
    sessionStorage.removeItem("settly.pendingJoin");
    getJoinPreview(token).then((preview) => {
      if (preview && preview.unclaimed.length > 0) {
        // Hay personas añadidas sin cuenta en el grupo: dejamos que el
        // invitado elija "soy yo" en vez de crear un miembro nuevo directo.
        setJoinPreview({ token, groupName: preview.groupName, unclaimed: preview.unclaimed });
        return;
      }
      joinByToken(token, user.id).then((g) => {
        if (g) { addGroup(g); setActiveGroup(g.id); }
      });
    });
  }, [phase, user]);

  function resolveJoin(memberId?: string) {
    if (!joinPreview || !user) return;
    const { token } = joinPreview;
    setJoinPreview(null);
    joinByToken(token, user.id, memberId).then((g) => {
      if (g) { addGroup(g); setActiveGroup(g.id); }
    });
  }

  useEffect(() => {
    // Refresca el token de push nativo al iniciar sesión (Apple puede rotarlo).
    // No-op en web o si el usuario no lo activó.
    if (phase === "authenticated") void refreshNativePush();
  }, [phase]);

  useEffect(() => {
    // El onboarding se muestra una sola vez (flag persistente). Se puede
    // volver a ver con el botón "?" de la cabecera.
    if (phase !== "authenticated" && phase !== "guest") return;
    try {
      if (localStorage.getItem("settly.onboarded")) return;
    } catch {}
    setOnboardingForced(true);
    setShowOnboarding(true);
  }, [phase]);

  useEffect(() => {
    // Recordatorio automático de feedback (~1 vez por semana). Solo para
    // usuarios autenticados (los invitados no pueden persistir), tras varias
    // aperturas y sin chocar con el onboarding.
    if (phase !== "authenticated") return;
    registerAppOpen();
    let onboarded = false;
    try { onboarded = !!localStorage.getItem("settly.onboarded"); } catch {}
    if (!onboarded || !shouldShowFeedbackPrompt()) return;
    const id = setTimeout(() => {
      markFeedbackPromptShown();
      setShowFeedback(true);
    }, 2000);
    return () => clearTimeout(id);
  }, [phase]);

  if (showLoading) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-3"
        style={{ background: "#0D1B2A" }}
      >
        <div className="anim-logo-pulse">
          <Logo size={64} />
        </div>
        <div className="text-white font-display text-2xl font-extrabold">Settlia</div>
      </div>
    );
  }

  if (phase === "needs_name") return <SetNameScreen />;
  if (phase === "needs_phone" || phase === "phone_otp_sent") return <PhoneScreen />;
  if (phase === "unauthenticated" || phase === "otp_sent") return <Login />;
  if (!user) return <Login />;

  return (
    <div className="pb-20" style={{ minHeight: "calc(100vh + 1px)" }}>
      <OfflineBanner />
      {!group && homeTab === "groups" && (
        <div className="max-w-2xl mx-auto px-4 pt-4 flex items-center justify-end gap-2">
          {user.email === ADMIN_EMAIL && (
            <button
              onClick={() => setShowAdmin(true)}
              className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift"
              title="Admin"
            >
              <Icon name="chart" size={16} />
            </button>
          )}
          <button
            onClick={() => { setOnboardingForced(false); setShowOnboarding(true); }}
            className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift"
            title={t("onboard.replay")}
          >
            <Icon name="help" size={16} />
          </button>
          <button
            onClick={() => setShowFaq(true)}
            className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift"
            title={t("faq.entry")}
          >
            <Icon name="info" size={16} />
          </button>
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
      )}

      {group ? <GroupView group={group} /> : <Home tab={homeTab} />}

      <BottomNav
        active={navActive}
        unread={unread}
        userName={user.name}
        onGroups={() => {
          setActiveGroup(null);
          setHomeTab("groups");
          setShowActivity(false);
          setShowAccount(false);
        }}
        onFriends={() => {
          setActiveGroup(null);
          setHomeTab("contacts");
          setShowActivity(false);
          setShowAccount(false);
        }}
        onActivity={() => {
          setShowAccount(false);
          setShowActivity(true);
        }}
        onProfile={() => {
          setShowActivity(false);
          setShowAccount(true);
        }}
      />

      {joinPreview && (
        <ClaimMemberModal
          groupName={joinPreview.groupName}
          unclaimed={joinPreview.unclaimed}
          onPick={resolveJoin}
        />
      )}

      {showActivity && <NotificationsBell open={showActivity} onClose={() => setShowActivity(false)} />}
      {showAdmin && <AdminDashboard onClose={() => setShowAdmin(false)} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
      {showFaq && <FaqModal onClose={() => setShowFaq(false)} />}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {showAIConsent && (
        <AIConsentModal
          onDecide={(ok) => { resolveAIConsent(ok); setShowAIConsent(false); }}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          canSkip={!onboardingForced}
          onDone={() => {
            try { localStorage.setItem("settly.onboarded", "1"); } catch {}
            setShowOnboarding(false);
          }}
        />
      )}

      <footer className="max-w-2xl mx-auto px-4 text-center text-xs text-muted pb-10 leading-relaxed">
        {phase === "guest" ? (
          <>
            {t("app.footer")}{" "}
            <button onClick={resetSeed} className="lk underline">
              {t("app.resetDemo")}
            </button>
          </>
        ) : (
          <>
            {t("app.footerCloud")}{" "}
            <a href="mailto:hello@settlia.app" className="lk underline">
              hello@settlia.app
            </a>
          </>
        )}
      </footer>
    </div>
  );
}

function SetNameScreen() {
  const t = useT();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim() || loading) return;
    setLoading(true);
    await setProfileName(name.trim());
    setLoading(false);
  }

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 w-full max-w-sm text-center anim-pop">
        <div className="flex justify-center mb-4">
          <Logo size={48} />
        </div>
        <h2 className="font-display text-2xl font-bold mb-1">{t("login.namePrompt")}</h2>
        <p className="text-sm text-muted mb-5">{t("login.nameHint")}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("login.name")}
          className="glass rounded-xl px-3 py-2.5 text-sm w-full mb-3"
        />
        <button
          onClick={submit}
          disabled={!name.trim() || loading}
          className="w-full rounded-full px-4 py-3 font-semibold text-white hover-lift disabled:opacity-50"
          style={{ background: "var(--ink)" }}
        >
          {t("login.continue")}
        </button>
      </div>
    </div>
  );
}

function PhoneScreen() {
  const t = useT();
  const phase = useAuthPhase();
  const pendingPhone = usePendingPhone();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const p = phone.trim();
    if (!p || loading) return;
    setLoading(true);
    setError("");
    try {
      await submitPhone(p);
    } catch (e: any) {
      setError(e.message ?? t("phone.errorSend"));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (otp.length < 6 || !pendingPhone || loading) return;
    setLoading(true);
    setError("");
    try {
      await verifyPhone(pendingPhone, otp.trim());
    } catch {
      setError(t("phone.errorOtp"));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!pendingPhone || loading) return;
    setLoading(true);
    setError("");
    setOtp("");
    try {
      await submitPhone(pendingPhone);
    } catch (e: any) {
      setError(e.message ?? t("phone.errorSend"));
    } finally {
      setLoading(false);
    }
  }

  if (phase === "phone_otp_sent" && pendingPhone) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="glass-strong rounded-3xl p-8 w-full max-w-sm text-center anim-pop">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <div className="text-4xl mb-3">📱</div>
          <h2 className="font-display text-2xl font-bold mb-1">{t("phone.checkTitle")}</h2>
          <p className="text-sm text-muted mb-5">
            {t("phone.otpSent")} <strong>{pendingPhone}</strong>
          </p>
          <input
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="123456"
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
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 w-full max-w-sm text-center anim-pop">
        <div className="flex justify-center mb-4"><Logo size={48} /></div>
        <div className="text-4xl mb-3">📱</div>
        <h2 className="font-display text-2xl font-bold mb-1">{t("phone.title")}</h2>
        <p className="text-sm text-muted mb-5">{t("phone.hint")}</p>
        <input
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="+1 234 567 8900"
          type="tel"
          className="glass rounded-xl px-3 py-2.5 text-sm w-full mb-3"
        />
        {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}
        <button
          onClick={send}
          disabled={!phone.trim() || loading}
          className="w-full rounded-full px-4 py-3 font-semibold text-white hover-lift disabled:opacity-50"
          style={{ background: "var(--ink)" }}
        >
          {loading ? t("login.sending") : t("phone.send")}
        </button>
        <button onClick={skipPhone} className="lk text-sm w-full text-center mt-3 text-muted">
          {t("phone.skip")}
        </button>
      </div>
    </div>
  );
}
