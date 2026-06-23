import { useState } from "react";
import { isStandalone } from "../lib/pwa";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { InstallGuide } from "./InstallGuide";

export function InstallButton({ className }: { className?: string }) {
  const t = useT();
  const [show, setShow] = useState(false);

  // Ya instalada → nada que hacer.
  if (isStandalone()) return null;

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className={
          className ??
          "glass rounded-full px-3 py-1.5 text-sm hover-lift text-muted inline-flex items-center gap-1.5"
        }
      >
        <Icon name="download" size={15} /> {t("install.btn")}
      </button>

      {show && (
        <Overlay onClose={() => setShow(false)}>
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
            <h3 className="font-display text-lg font-bold mb-1">{t("install.guideTitle")}</h3>
            <p className="text-sm text-muted mb-4 leading-relaxed">{t("install.guideDesc")}</p>

            <InstallGuide />

            <button
              onClick={() => setShow(false)}
              className="w-full rounded-full py-2.5 font-semibold text-muted glass hover-lift mt-4"
            >
              {t("common.ok")}
            </button>
          </div>
        </Overlay>
      )}
    </>
  );
}
