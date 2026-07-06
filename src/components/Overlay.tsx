import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Capa modal renderizada en document.body (vía portal) para que SIEMPRE
 *  quede por encima de todo, sin que los stacking contexts del glass/backdrop
 *  la dejen detrás. El contenido (la tarjeta) gestiona su propio stopPropagation. */
export function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 anim-up"
      onClick={onClose}
    >
      {children}
    </div>,
    document.body
  );
}
