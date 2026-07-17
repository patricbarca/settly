import { useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

// Modal con el enlace de invitación ya creado. Se abre cuando la copia directa
// falla (típico en iOS: tras el `await` de crear el link se pierde el "user
// gesture" y navigator.clipboard/share lanzan NotAllowedError). Aquí el botón
// Copiar/Compartir corre en SU PROPIO gesto (el tap del botón), así que sí
// funciona; y además el link se ve para copiarlo a mano si todo lo demás falla.
export function ShareLinkModal({ link, title, onClose }: { link: string; title?: string; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback sin Clipboard API: seleccionar + execCommand("copy").
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
        el.setSelectionRange(0, link.length);
        try { document.execCommand("copy"); } catch { /* nada más que hacer */ }
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      if (navigator.share) await navigator.share({ title: title || "Settlia", url: link });
    } catch { /* usuario canceló */ }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl font-bold">{t("share.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="text-sm text-muted mb-3">{t("share.hint")}</p>

        <input
          ref={inputRef}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="glass rounded-xl px-3 py-2.5 text-sm w-full font-mono mb-3"
        />

        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 glass-strong rounded-full px-4 py-2.5 font-semibold hover-lift inline-flex items-center justify-center gap-1.5"
            style={{ color: copied ? "#0A8B5E" : "var(--teal)" }}
          >
            <Icon name={copied ? "check" : "copy"} size={15} />
            {copied ? t("group.copied") : t("share.copy")}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={nativeShare}
              className="glass rounded-full px-4 py-2.5 font-semibold hover-lift inline-flex items-center gap-1.5 text-muted shrink-0"
            >
              <Icon name="external" size={15} /> {t("share.share")}
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}
