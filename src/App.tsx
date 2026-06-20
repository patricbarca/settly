import { useEffect, useState } from "react";
import { useUser, useAuthPhase, signOut, setProfileName } from "./lib/auth";
import { useLang, setLang, useT } from "./lib/i18n";
import { resetSeed, useActiveGroup, loadGuestMode } from "./lib/store";
import { useTheme, toggleTheme } from "./lib/theme";
import { personColor, initials } from "./lib/format";
import { joinByToken } from "./lib/invite";
import { addGroup, setActiveGroup } from "./lib/store";
import { Icon } from "./components/Icon";
import { Login } from "./components/Login";
import { Home } from "./components/Home";
import { GroupView } from "./components/GroupView";
import { Logo } from "./components/Logo";

export default function App() {
  const user = useUser();
  const phase = useAuthPhase();
  const t = useT();
  const lang = useLang();
  const theme = useTheme();
  const group = useActiveGroup();

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
    joinByToken(token, user.id).then((g) => {
      if (g) { addGroup(g); setActiveGroup(g.id); }
    });
  }, [phase, user]);

  if (phase === "loading") {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center anim-up">
          <Logo size={40} />
        </div>
      </div>
    );
  }

  if (phase === "needs_name") return <SetNameScreen />;
  if (phase === "unauthenticated" || phase === "otp_sent") return <Login />;
  if (!user) return <Login />;

  return (
    <div className="min-h-full">
      <div className="max-w-2xl mx-auto px-4 pt-4 flex items-center justify-end gap-2">
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
        <div className="glass rounded-full pl-1 pr-1.5 py-1 flex items-center gap-1.5 text-sm">
          <span
            className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: personColor(user.name) + "22" }}
          >
            {initials(user.name)}
          </span>
          <span className="font-medium max-w-[90px] truncate">{user.name}</span>
          <button onClick={signOut} className="lk ml-0.5 flex items-center" title={t("app.signout")}>
            <Icon name="power" size={15} />
          </button>
        </div>
      </div>

      {group ? <GroupView group={group} /> : <Home />}

      <footer className="max-w-2xl mx-auto px-4 text-center text-xs text-muted pb-10 leading-relaxed">
        {phase === "guest" ? (
          <>
            {t("app.footer")}{" "}
            <button onClick={resetSeed} className="lk underline">
              {t("app.resetDemo")}
            </button>
          </>
        ) : (
          t("app.footerCloud")
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
