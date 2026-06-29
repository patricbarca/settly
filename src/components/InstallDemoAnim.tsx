// Demo animada del proceso de instalación de la PWA en iOS/Safari. Muestra el
// flujo real del Safari nuevo: tocar «•••» (abajo a la derecha) → aparece el
// menú con «Compartir» → se abre la hoja con «Añadir a inicio» → el icono salta
// a la pantalla de inicio, en bucle. CSS keyframes autocontenidos.
import { Logo } from "./Logo";
import { useT } from "../lib/i18n";

const CSS = `
@keyframes idemo-browser { 0%,68%{opacity:1} 74%,100%{opacity:0} }
@keyframes idemo-home    { 0%,68%{opacity:0} 74%,100%{opacity:1} }
@keyframes idemo-menu    { 0%,14%{opacity:0;transform:translateY(8px) scale(.96)} 19%,37%{opacity:1;transform:translateY(0) scale(1)} 41%,100%{opacity:0;transform:translateY(8px) scale(.96)} }
@keyframes idemo-sheet   { 0%,39%{transform:translateY(118%)} 47%,100%{transform:translateY(0)} }
@keyframes idemo-tapMore { 0%,3%{opacity:0;transform:scale(.4)} 8%{opacity:.65;transform:scale(.5)} 16%{opacity:0;transform:scale(2.4)} 100%{opacity:0} }
@keyframes idemo-tapShare{ 0%,24%{opacity:0;transform:scale(.4)} 28%{opacity:.65;transform:scale(.5)} 36%{opacity:0;transform:scale(2.4)} 100%{opacity:0} }
@keyframes idemo-tapAdd  { 0%,51%{opacity:0;transform:scale(.4)} 55%{opacity:.65;transform:scale(.5)} 63%{opacity:0;transform:scale(2.4)} 100%{opacity:0} }
@keyframes idemo-shareHl { 0%,23%{background:transparent} 28%,36%{background:rgba(96,165,250,.28)} 40%,100%{background:transparent} }
@keyframes idemo-addHl   { 0%,50%{background:transparent} 55%,64%{background:rgba(96,165,250,.28)} 68%,100%{background:transparent} }
@keyframes idemo-pop     { 0%,72%{opacity:0;transform:scale(.3)} 80%{opacity:1;transform:scale(1.14)} 86%,100%{opacity:1;transform:scale(1)} }
@keyframes idemo-label   { 0%,76%{opacity:0} 84%,100%{opacity:1} }
`;

function ShareGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export function InstallDemoAnim({ scale = 1.5 }: { scale?: number }) {
  const t = useT();
  const D = "10s";
  const grid = Array.from({ length: 8 });
  const W = 152, H = 224;

  return (
    <div style={{ width: W * scale, height: H * scale, margin: "0 auto" }}>
    <div style={{ position: "relative", width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
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
                Settlia
              </span>
            </div>
            {/* contenido falso */}
            <div style={{ flex: 1, padding: "2px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 22, borderRadius: 8, background: "rgba(255,255,255,.7)", boxShadow: "0 6px 16px -12px rgba(58,58,90,.5)" }} />
              ))}
            </div>

            {/* barra inferior estilo Safari: atrás · URL · recargar · ••• */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 7px 8px", background: "rgba(255,255,255,.55)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3a3f4a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.92)", borderRadius: 8, padding: "4px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: "#1a1c22" }}>app.settlia.app</span>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3a3f4a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v5h-5" /></svg>
              {/* botón ••• (más) */}
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#3a3f4a"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                <span style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "2px solid #60A5FA",
                  animation: `idemo-tapMore ${D} ease-out infinite` }} />
              </span>
            </div>

            {/* menú emergente del ••• (con "Compartir") */}
            <div style={{
              position: "absolute", right: 6, bottom: 40, width: 114, borderRadius: 12, padding: 4,
              background: "rgba(255,255,255,.98)", boxShadow: "0 12px 32px -10px rgba(0,0,0,.4)",
              animation: `idemo-menu ${D} cubic-bezier(.4,1.2,.5,1) infinite`,
            }}>
              {/* fila Compartir (resaltada) */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "5px 7px",
                animation: `idemo-shareHl ${D} ease-in-out infinite` }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#1a1c22" }}>{t("install.demoShare")}</span>
                <span style={{ marginLeft: "auto", display: "inline-flex" }}><ShareGlyph /></span>
                <span style={{ position: "absolute", left: "50%", top: "50%", width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: "50%",
                  border: "2px solid #60A5FA", animation: `idemo-tapShare ${D} ease-out infinite` }} />
              </div>
              {/* filas atenuadas */}
              {[0, 1].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", opacity: .45 }}>
                  <span style={{ width: 54, height: 7, borderRadius: 4, background: "#dfe3ea" }} />
                  <span style={{ marginLeft: "auto", width: 13, height: 13, borderRadius: 4, background: "#dfe3ea" }} />
                </div>
              ))}
            </div>

            {/* hoja de Compartir que sube (con "Añadir a inicio") */}
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
              {/* slot 0 = Settlia que aparece */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <span style={{ animation: `idemo-pop ${D} cubic-bezier(.4,1.5,.5,1) infinite`, display: "inline-flex" }}>
                  <Logo size={26} />
                </span>
                <span style={{ fontSize: 7, color: "rgba(255,255,255,.85)", fontWeight: 600, animation: `idemo-label ${D} ease-in-out infinite` }}>Settlia</span>
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
    </div>
  );
}
