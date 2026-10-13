import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { haptic } from "../lib/haptics";

/** Capa modal renderizada en document.body (vía portal) para que SIEMPRE
 *  quede por encima de todo, sin que los stacking contexts del glass/backdrop
 *  la dejen detrás. El contenido (la tarjeta) gestiona su propio stopPropagation.
 *
 *  En móvil la tarjeta se muestra como HOJA inferior estilo iOS (ver
 *  `.sheet-overlay` en index.css) y se puede cerrar arrastrándola hacia abajo
 *  desde su parte superior. `center` mantiene el modal centrado (visor de fotos). */
export function Overlay({
  onClose,
  children,
  center = false,
}: {
  onClose: () => void;
  children: ReactNode;
  center?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ el: HTMLElement; startY: number; dy: number } | null>(null);

  function sheetEl(): HTMLElement | null {
    if (center || !window.matchMedia("(max-width: 639px)").matches) return null;
    return (wrap.current?.firstElementChild as HTMLElement | null) ?? null;
  }

  function onTouchStart(ev: React.TouchEvent) {
    const el = sheetEl();
    if (!el) return;
    const y = ev.touches[0].clientY;
    // Solo desde el asa / la franja superior y con el contenido arriba del
    // todo: así no se pelea con el scroll interno de la hoja.
    if (y - el.getBoundingClientRect().top > 44 || el.scrollTop > 0) return;
    drag.current = { el, startY: y, dy: 0 };
    el.style.transition = "none";
  }
  function onTouchMove(ev: React.TouchEvent) {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, ev.touches[0].clientY - d.startY);
    d.el.style.transform = `translateY(${d.dy}px)`;
  }
  function onTouchEnd() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.el.style.transition = "transform 0.25s cubic-bezier(0.2, 0.9, 0.25, 1)";
    d.el.style.transform = "";
    if (d.dy > 90) {
      haptic("light");
      // Si el modal no permite cerrarse (onClose no-op), la hoja vuelve a su sitio.
      onClose();
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={wrap}
      className={
        center
          ? "fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 anim-up"
          : "sheet-overlay fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm pt-3 sm:p-3"
      }
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>,
    document.body
  );
}
