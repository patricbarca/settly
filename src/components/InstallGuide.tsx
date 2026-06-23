// Guía de instalación de la PWA, según el dispositivo:
//  - Android / escritorio (Chrome/Edge): botón que lanza el diálogo nativo.
//  - iOS / Safari: no hay API → pasos Compartir → Añadir a pantalla de inicio.
//  - Ya instalada (standalone): mensaje de confirmación.
// Se usa en el onboarding (sobre fondo oscuro, dark) y en un modal (claro).
import { useInstallPrompt, clearInstallPrompt, isIOS, isStandalone } from "../lib/pwa";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px" }}>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export function InstallGuide({ dark = false }: { dark?: boolean }) {
  const t = useT();
  const prompt = useInstallPrompt();
  const ios = isIOS();
  const installed = isStandalone();

  const fg = dark ? "rgba(255,255,255,0.95)" : "var(--ink)";
  const sub = dark ? "rgba(255,255,255,0.7)" : "var(--muted)";
  const cardBg = dark ? "rgba(255,255,255,0.12)" : "var(--glass)";

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch {}
    clearInstallPrompt();
  }

  // Indicador de "ya instalada" (no oculta los pasos: se muestran igual como guía).
  const installedBadge = installed ? (
    <div className="flex justify-center mb-3">
      <span className="inline-flex items-center gap-1.5 font-semibold text-sm rounded-full px-3 py-1"
        style={{ background: dark ? "rgba(155,246,201,0.18)" : "rgba(10,139,94,0.12)", color: dark ? "#9bf6c9" : "#0A8B5E" }}>
        <Icon name="check" size={15} /> {t("install.installed")}
      </span>
    </div>
  ) : null;

  if (ios) {
    const steps: React.ReactNode[] = [
      <>{t("install.iosS1")} <ShareGlyph /></>,
      t("install.iosS2"),
      t("install.iosS3"),
    ];
    return (
      <div className="w-full max-w-xs mx-auto">
        {installedBadge}
        <div className="rounded-2xl p-4 space-y-2.5" style={{ background: cardBg }}>
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm" style={{ color: fg }}>
              <span className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: dark ? "rgba(255,255,255,0.18)" : "var(--surface-soft)", color: fg }}>
                {i + 1}
              </span>
              <span className="leading-snug">{s}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Android / escritorio
  return (
    <div className="w-full max-w-xs mx-auto text-center">
      {installedBadge}
      {prompt && (
        <button onClick={install}
          className="w-full rounded-full py-3.5 font-bold hover-lift inline-flex items-center justify-center gap-2"
          style={{ background: dark ? "rgba(255,255,255,0.95)" : "var(--ink)", color: dark ? "#120d36" : "#fff" }}>
          <Icon name="download" size={18} /> {t("install.btn")}
        </button>
      )}
      <div className="text-xs mt-3 leading-relaxed" style={{ color: sub }}>
        {t("install.menuHint")}
      </div>
    </div>
  );
}
