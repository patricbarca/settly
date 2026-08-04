import { useCallback, useRef, useState } from "react";

// Imagen con zoom por pellizco (pinch), doble-tap y arrastre para mover.
// Sin dependencias: usa touch events + transform. Pensada para el visor del
// recibo a pantalla completa (iOS/Android/desktop). `touch-action: none` evita
// que el navegador haga su propio scroll/zoom durante el gesto.
export function ZoomableImage({ src, alt = "" }: { src: string; alt?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const g = useRef({
    mode: "" as "" | "pinch" | "pan",
    startDist: 0,
    startScale: 1,
    startTx: 0,
    startTy: 0,
    panX: 0,
    panY: 0,
    lastTap: 0,
  });

  const clampOffset = useCallback((nx: number, ny: number, s: number) => {
    const el = wrapRef.current;
    if (!el) return { x: nx, y: ny };
    const r = el.getBoundingClientRect();
    const maxX = ((s - 1) * r.width) / 2;
    const maxY = ((s - 1) * r.height) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  }, []);

  function distance(t: React.TouchList) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  function toggleZoom() {
    if (scale > 1) {
      setScale(1);
      setTx(0);
      setTy(0);
    } else {
      setScale(2.5);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches;
    if (t.length === 2) {
      g.current.mode = "pinch";
      g.current.startDist = distance(t);
      g.current.startScale = scale;
      g.current.startTx = tx;
      g.current.startTy = ty;
    } else if (t.length === 1) {
      const now = Date.now();
      if (now - g.current.lastTap < 300) {
        toggleZoom();
        g.current.lastTap = 0;
        g.current.mode = "";
        return;
      }
      g.current.lastTap = now;
      if (scale > 1) {
        g.current.mode = "pan";
        g.current.panX = t[0].clientX;
        g.current.panY = t[0].clientY;
        g.current.startTx = tx;
        g.current.startTy = ty;
      } else {
        g.current.mode = "";
      }
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches;
    if (g.current.mode === "pinch" && t.length === 2) {
      const d = distance(t);
      let ns = g.current.startScale * (d / (g.current.startDist || 1));
      ns = Math.max(1, Math.min(5, ns));
      setScale(ns);
      if (ns <= 1.01) {
        setTx(0);
        setTy(0);
      } else {
        const c = clampOffset(g.current.startTx, g.current.startTy, ns);
        setTx(c.x);
        setTy(c.y);
      }
    } else if (g.current.mode === "pan" && t.length === 1) {
      const dx = t[0].clientX - g.current.panX;
      const dy = t[0].clientY - g.current.panY;
      const c = clampOffset(g.current.startTx + dx, g.current.startTy + dy, scale);
      setTx(c.x);
      setTy(c.y);
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) g.current.mode = "";
    else if (e.touches.length === 1 && g.current.mode === "pinch") {
      // soltó un dedo del pinch: pasa a pan con el que queda
      g.current.mode = scale > 1 ? "pan" : "";
      g.current.panX = e.touches[0].clientX;
      g.current.panY = e.touches[0].clientY;
      g.current.startTx = tx;
      g.current.startTy = ty;
    }
  }

  function onWheel(e: React.WheelEvent) {
    let ns = scale - e.deltaY * 0.0015;
    ns = Math.max(1, Math.min(5, ns));
    setScale(ns);
    if (ns <= 1.01) {
      setTx(0);
      setTy(0);
    } else {
      const c = clampOffset(tx, ty, ns);
      setTx(c.x);
      setTy(c.y);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden rounded-3xl bg-black/20 max-h-[80vh] flex items-center justify-center"
      style={{ touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onDoubleClick={toggleZoom}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain select-none"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: g.current.mode ? "none" : "transform 0.15s ease-out",
          cursor: scale > 1 ? "grab" : "zoom-in",
        }}
      />
    </div>
  );
}
