// Demo animada del proceso de instalación de la PWA: muestra un "móvil" donde
// se toca Compartir → "Añadir a inicio" → el icono salta a la pantalla de
// inicio, en bucle. Pensada sobre todo para iOS (no hay API de instalación),
// pero sirve de guía visual universal. CSS keyframes autocontenidos.
import { Logo } from "./Logo";
import { useT } from "../lib/i18n";

const CSS = `
@keyframes idemo-browser { 0%,57%{opacity:1} 63%,100%{opacity:0} }
@keyframes idemo-home    { 0%,57%{opacity:0} 63%,100%{opacity:1} }
@keyframes idemo-sheet   { 0%,22%{transform:translateY(112%)} 30%,100%{transform:translateY(0)} }
@keyframes idemo-tapShare{ 0%,5%{opacity:0;transform:scale(.4)} 9%{opacity:.65;transform:scale(.5)} 20%{opacity:0;transform:scale(2.6)} 100%{opacity:0} }
@keyframes idemo-tapAdd  { 0%,37%{opacity:0;transform:scale(.4)} 41%{opacity:.65;transform:scale(.5)} 53%{opacity:0;transform:scale(2.6)} 100%{opacity:0} }
@keyframes idemo-addHl   { 0%,36%{background:transparent} 42%,54%{background:rgba(96,165,250,.28)} 58%,100%{background:transparent} }
@keyframes idemo-pop     { 0%,66%{opacity:0;transform:scale(.3)} 74%{opacity:1;transform:scale(1.14)} 81%,100%{opacity:1;transform:scale(1)} }
@keyframes idemo-label   { 0%,70%{opacity:0} 80%,100%{opacity:1} }
`;

export function InstallDemoAnim() {
  const t = useT();
  const D = "8s";
  const grid = Array.from({ length: 8 });

  return (
    <div style={{ position: "relative", width: 152, height: 224, margin: "0 auto" }}>
      <style>{CSS}</style>
      {/* Marco del teléfono */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 30, padding: 7,
        background: "linear-gradient(160deg,#23252c,#15171c)",
        boxShadow: "0 24px 50px -22px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1)",
      }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 23, overflow: "hidden", background: "#0b1020" }}>

          {/* ── Capa NAVEGADOR ── */}
          <div style={{ position: "absolute", inset: 0, animation: `idemo-browser ${D} ease-in-out infinite`,
            background: "linear-gradient(160deg,#eef1ec,#e6eaf3)", display: "flex", flexDirection: "column" }}>
            {/* mini header app */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 9px 6px" }}>
              <Logo size={16} />
              <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 12, color: "#1a1c22" }}>
                Settl<span style={{ color: "#2563EB" }}>iA</span>
              </span>
            </div>
            {/* contenido falso */}
            <div style={{ flex: 1, padding: "2px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 22, borderRadius: 8, background: "rgba(255,255,255,.7)", boxShadow: "0 6px 16px -12px rgba(58,58,90,.5)" }} />
              ))}
            </div>
            {/* barra inferior con botón Compartir (iOS) */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "7px 0 9px", gap: 26, background: "rgba(255,255,255,.5)" }}>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                </svg>
                {/* tap ripple en Compartir */}
                <span style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "2px solid #60A5FA",
                  animation: `idemo-tapShare ${D} ease-out infinite` }} />
              </span>
              <span style={{ width: 16, height: 2, background: "#9aa0ac", borderRadius: 2, opacity: .5 }} />
            </div>

            {/* hoja de Compartir que sube */}
            <div style={{
              position: "absolute", left: 8, right: 8, bottom: 8, borderRadius: 16, padding: 9,
              background: "rgba(255,255,255,.97)", boxShadow: "0 -10px 30px -16px rgba(0,0,0,.4)",
              animation: `idemo-sheet ${D} cubic-bezier(.4,1.3,.5,1) infinite`,
            }}>
              <div style={{ width: 34, height: 4, borderRadius: 4, background: "#cfd3da", margin: "0 auto 9px" }} />
              {/* fila Añadir a inicio (resaltada) */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "7px 8px",
                animation: `idemo-addHl ${D} ease-in-out infinite` }}>
                <Logo size={20} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1c22" }}>{t("install.demoAdd")}</span>
                <span style={{ marginLeft: "auto", fontSize: 14, color: "#1a1c22" }}>＋</span>
                <span style={{ position: "absolute", left: 10, top: "50%", width: 18, height: 18, marginTop: -9, borderRadius: "50%",
                  border: "2px solid #60A5FA", animation: `idemo-tapAdd ${D} ease-out infinite` }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", opacity: .5 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: "#dfe3ea" }} />
                <span style={{ width: 70, height: 8, borderRadius: 4, background: "#dfe3ea" }} />
              </div>
            </div>
          </div>

          {/* ── Capa PANTALLA DE INICIO ── */}
          <div style={{ position: "absolute", inset: 0, animation: `idemo-home ${D} ease-in-out infinite`,
            background: "radial-gradient(120% 80% at 30% 10%, #6e6cf5 0%, #241c53 55%, #141033 100%)",
            padding: "16px 14px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, gridAutoRows: "min-content" }}>
              {/* slot 0 = SettliA que aparece */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <span style={{ animation: `idemo-pop ${D} cubic-bezier(.4,1.5,.5,1) infinite`, display: "inline-flex" }}>
                  <Logo size={26} />
                </span>
                <span style={{ fontSize: 7, color: "rgba(255,255,255,.85)", fontWeight: 600, animation: `idemo-label ${D} ease-in-out infinite` }}>SettliA</span>
              </div>
              {grid.map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,.16)" }} />
                  <span style={{ width: 16, height: 4, borderRadius: 3, background: "rgba(255,255,255,.12)" }} />
                </div>
              ))}
            </div>
            {/* dock */}
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", gap: 12, background: "rgba(255,255,255,.12)", borderRadius: 16, padding: "8px 12px" }}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(255,255,255,.22)" }} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
