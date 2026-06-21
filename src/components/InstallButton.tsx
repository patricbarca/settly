import { useState } from "react";
import { useInstallPrompt, clearInstallPrompt, isStandalone, isIOS } from "../lib/pwa";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function InstallButton({ className }: { className?: string }) {
  const t = useT();
  const prompt = useInstallPrompt();
  const [showIOS, setShowIOS] = useState(false);
  const ios = isIOS();

  // Already installed → nothing to do.
  if (isStandalone()) return null;
  // On non-iOS we can only offer install when the browser gave us a prompt.
  if (!ios && !prompt) return null;

  async function click() {
    if (ios) {
      setShowIOS(true);
      return;
    }
    if (!prompt) return;
    prompt.prompt();
    try {
      await prompt.userChoice;
    } catch {}
    clearInstallPrompt();
  }

  return (
    <>
      <button
        onClick={click}
        className={
          className ??
          "glass rounded-full px-3 py-1.5 text-sm hover-lift text-muted inline-flex items-center gap-1.5"
        }
      >
        <Icon name="download" size={15} /> {t("install.btn")}
      </button>

      {showIOS && (
        <Overlay onClose={() => setShowIOS(false)}>
          <div
            className="glass-strong rounded-3xl w-full max-w-xs p-6 anim-pop text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <span
                className="h-12 w-12 rounded-full flex items-center justify-center"
                style={{ background: "rgba(15,163,163,0.15)", color: "var(--teal)" }}
              >
                <Icon name="download" size={22} />
              </span>
            </div>
            <h3 className="font-display text-lg font-bold mb-2">{t("install.iosTitle")}</h3>
            <p className="text-sm text-muted mb-4 leading-relaxed">
              {t("install.iosStep1")} <strong>{t("install.iosShare")}</strong> {t("install.iosStep2")}{" "}
              <strong>{t("install.iosAdd")}</strong>.
            </p>
            <button
              onClick={() => setShowIOS(false)}
              className="w-full rounded-full py-2.5 font-semibold text-white"
              style={{ background: "var(--ink)" }}
            >
              {t("common.ok")}
            </button>
          </div>
        </Overlay>
      )}
    </>
  );
}
