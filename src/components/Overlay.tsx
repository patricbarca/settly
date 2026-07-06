import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Capa modal renderizada en document.body (vía portal) para que SIEMPRE
 *  quede por encima de todo, sin que los stacking contexts del glass/backdrop
 *  la dejen detrás. El contenido (la tarjeta) gestiona su propio stopPropagation.
 *
 *  `respectBottomNav`: para modales abiertos desde la barra inferior (p. ej.
 *  Perfil) — deja la franja de BottomNav libre y por delante en vez de
 *  taparla, para que la barra siga siempre visible. */
export function Overlay({
  onClose,
  children,
  respectBottomNav,
}: {
  onClose: () => void;
  children: ReactNode;
  respectBottomNav?: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 anim-up ${
        respectBottomNav ? "z-30" : "z-[1000]"
      }`}
      style={{ bottom: respectBottomNav ? "calc(var(--bottomnav-h) + env(safe-area-inset-bottom))" : 0 }}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body
  );
}
