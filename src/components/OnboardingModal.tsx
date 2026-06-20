import { useState, useEffect, useRef } from "react";
import { useT } from "../lib/i18n";
import { Logo } from "./Logo";

// ── Injected CSS keyframes ───────────────────────────────────────────────────
const ANIM = `
  @keyframes ob-scan {
    0%   { top: 2%; }
    100% { top: 96%; }
  }
  @keyframes ob-fadeup {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ob-pop {
    0%   { transform: scale(0.75); opacity: 0; }
    70%  { transform: scale(1.04); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes ob-float {
    0%, 100% { transform: translateY(0px); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes ob-ring {
    0%   { transform: scale(1); opacity: 0.55; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  @keyframes ob-bar {
    0%, 100% { transform: scaleY(0.15); }
    50%      { transform: scaleY(1); }
  }
  @keyframes ob-fill {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes ob-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }
  @keyframes ob-slide-right {
    from { opacity: 0; transform: translateX(-12px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;

// ── Slide 1: Welcome — floating group cards ──────────────────────────────────
function Slide1Anim() {
  return (
    <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", position: "relative", height: 170 }}>
      <div style={{ animation: "ob-float 3.2s ease-in-out infinite", position: "absolute", top: 0, left: 0, right: 0 }}>
        <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: "11px 14px", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>✈️ Viaje a París</span>
            <span style={{ color: "#34d399", fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>+€24.50</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["T","#7c3aed"],["A","#0891b2"],["P","#dc2626"],["M","#d97706"]].map(([l,c],i) => (
              <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: `${c}44`, border: `2px solid ${c}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ animation: "ob-float 4s ease-in-out infinite", animationDelay: "1.4s", position: "absolute", top: 88, left: 12, right: 12 }}>
        <div style={{ background: "rgba(255,255,255,0.09)", borderRadius: 14, padding: "9px 12px", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 12 }}>🏠 Piso compartido</span>
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>−€38.00</span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {[["T","#7c3aed"],["L","#059669"],["C","#0891b2"]].map(([l,c],i) => (
              <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: `${c}44`, border: `1.5px solid ${c}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "white", fontWeight: 700 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 2: Groups — members appearing one by one ───────────────────────────
function Slide2Anim() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [900, 650, 650, 650, 2200];
    const t = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 900);
    return () => clearTimeout(t);
  }, [phase]);

  const members = [
    { name: "Tú", color: "#7c3aed" },
    { name: "Ana G.", color: "#0891b2" },
    { name: "Pedro R.", color: "#dc2626" },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 280, margin: "0 auto" }}>
      <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Cena de cumpleaños</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 36 }}>
          {members.slice(0, Math.min(phase + 1, 3)).map((m, i) => (
            <div key={i} style={{ animation: "ob-pop 0.4s cubic-bezier(.34,1.56,.64,1) both", background: `${m.color}2a`, border: `1.5px solid ${m.color}55`, borderRadius: 20, padding: "4px 10px", display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "white", fontWeight: 700 }}>{m.name[0]}</div>
              <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>{m.name}</span>
            </div>
          ))}
        </div>
        {phase >= 3 && (
          <div style={{ animation: "ob-fadeup 0.4s ease both", marginTop: 10, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>🔗</span>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>settly.app/join/xk9p</span>
            <span style={{ marginLeft: "auto", color: "#34d399", fontSize: 11, fontWeight: 700 }}>Copiar</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide 3: Receipt scan ────────────────────────────────────────────────────
function Slide3Anim() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [600, 2000, 1800, 2400];
    const t = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 600);
    return () => clearTimeout(t);
  }, [phase]);

  const items = [
    { name: "Pasta carbonara", price: "€14.50" },
    { name: "Pizza margherita", price: "€12.00" },
    { name: "Vino tinto ×2",   price: "€22.00" },
    { name: "Agua con gas",    price: "€4.50"  },
  ];

  if (phase >= 2) {
    return (
      <div style={{ width: "100%", maxWidth: 260, margin: "0 auto", animation: "ob-pop 0.5s cubic-bezier(.34,1.56,.64,1) both" }}>
        <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>✓ Gasto detectado</div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Cena restaurante</div>
          <div style={{ color: "#34d399", fontWeight: 800, fontSize: 24, fontFamily: "monospace", marginBottom: 10 }}>€53.00</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[["Tú","€17.67","#7c3aed"],["Ana","€17.67","#0891b2"],["Pedro","€17.66","#dc2626"]].map(([n,a,c],i) => (
              <div key={i} style={{ flex: 1, background: `${c}22`, border: `1px solid ${c}44`, borderRadius: 8, padding: "5px 4px", textAlign: "center", animation: `ob-fadeup 0.3s ease ${i * 0.1 + 0.1}s both` }}>
                <div style={{ color: "white", fontSize: 9, fontWeight: 700 }}>{n}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, fontFamily: "monospace" }}>{a}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(52,211,153,0.18)", borderRadius: 8, padding: "6px 8px", textAlign: "center", color: "#34d399", fontSize: 11, fontWeight: 700 }}>
            Añadir al grupo →
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 240, margin: "0 auto", position: "relative", animation: phase === 0 ? "ob-fadeup 0.5s ease both" : undefined }}>
      <div style={{ background: "#fffdf5", borderRadius: 10, padding: "12px 14px", boxShadow: "0 6px 24px rgba(0,0,0,0.35)" }}>
        <div style={{ textAlign: "center", color: "#333", fontWeight: 700, fontSize: 11, fontFamily: "monospace", marginBottom: 8, paddingBottom: 6, borderBottom: "1px dashed #ccc" }}>
          ★ RESTAURANTE EL SOL ★
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "#444", fontSize: 10, fontFamily: "monospace", marginBottom: 4, opacity: phase === 0 ? 0.35 : 1, animation: phase === 1 ? `ob-fadeup 0.35s ease ${i * 0.28 + 0.2}s both` : undefined }}>
            <span>{item.name}</span>
            <span>{item.price}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px dashed #bbb", paddingTop: 5, marginTop: 4, display: "flex", justifyContent: "space-between", color: "#111", fontWeight: 700, fontSize: 11, fontFamily: "monospace" }}>
          <span>TOTAL</span><span>€53.00</span>
        </div>
      </div>
      {phase === 1 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent 0%, rgba(0,220,200,0.9) 40%, rgba(0,220,200,0.9) 60%, transparent 100%)", boxShadow: "0 0 8px rgba(0,220,200,0.7)", animation: "ob-scan 1.7s linear forwards", pointerEvents: "none" }} />
      )}
    </div>
  );
}

// ── Slide 4: Voice to text ───────────────────────────────────────────────────
const VOICE_SENTENCE = "Cena con Ana y Pedro, pagué 90€";
function Slide4Anim() {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const delays = [800, 2200, 1600, 2200];
    const t = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 800);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 2) {
      setTyped("");
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setTyped(VOICE_SENTENCE.slice(0, i));
        if (i >= VOICE_SENTENCE.length) clearInterval(iv);
      }, 45);
      return () => clearInterval(iv);
    }
    if (phase === 0) setTyped("");
  }, [phase]);

  const bars = [0.5, 0.9, 0.65, 1, 0.75, 0.55, 0.85];

  return (
    <div style={{ width: "100%", maxWidth: 280, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Mic */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {phase === 1 && [1, 1.5, 2].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: 56, height: 56, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", animation: `ob-ring 1.4s ease-out infinite`, animationDelay: `${i * 0.45}s` }} />
        ))}
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: phase === 1 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.13)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, transition: "background 0.3s", border: "2px solid rgba(255,255,255,0.25)" }}>
          🎤
        </div>
      </div>

      {/* Equalizer bars */}
      {phase === 1 && (
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 32, animation: "ob-fadeup 0.3s ease both" }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 5, height: 28, background: "rgba(255,255,255,0.85)", borderRadius: 3, transformOrigin: "bottom", animation: `ob-bar ${0.5 + h * 0.35}s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}

      {/* Transcript text */}
      {(phase === 2 || phase === 3) && (
        <div style={{ animation: "ob-fadeup 0.3s ease both", background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "8px 14px", color: "white", fontSize: 13, fontStyle: "italic", textAlign: "center", maxWidth: 240 }}>
          "{typed}"
          {phase === 2 && typed.length < VOICE_SENTENCE.length && <span style={{ animation: "ob-pulse 0.8s ease-in-out infinite" }}>|</span>}
        </div>
      )}

      {/* Result expense card */}
      {phase === 3 && (
        <div style={{ animation: "ob-pop 0.45s cubic-bezier(.34,1.56,.64,1) both", background: "rgba(255,255,255,0.13)", borderRadius: 14, padding: "10px 14px", width: "100%", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>Cena</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>Pagó: Tú · Ana, Pedro</div>
            </div>
            <div style={{ color: "#34d399", fontWeight: 800, fontSize: 18, fontFamily: "monospace" }}>€90</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slide 5: Balances & settle ───────────────────────────────────────────────
function Slide5Anim() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [600, 1800, 1600, 2000];
    const t = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 600);
    return () => clearTimeout(t);
  }, [phase]);

  const people = [
    { name: "Ana G.", owes: 25, color: "#0891b2", pct: "62%" },
    { name: "Pedro R.", owes: 15, color: "#dc2626", pct: "38%" },
    { name: "Luis M.", owes: 8,  color: "#d97706", pct: "20%" },
  ];

  const settled = phase === 3;

  return (
    <div style={{ width: "100%", maxWidth: 280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
      {people.map((p, i) => (
        <div key={i} style={{ animation: `ob-fadeup 0.35s ease ${i * 0.12}s both`, background: "rgba(255,255,255,0.11)", borderRadius: 12, padding: "9px 12px", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${p.color}44`, border: `1.5px solid ${p.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700 }}>{p.name[0]}</div>
              <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>{p.name}</span>
            </div>
            <span style={{ color: settled ? "#34d399" : "#f87171", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
              {settled ? "€0" : `−€${p.owes}`}
            </span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: settled ? "#34d399" : p.color, width: settled ? "100%" : (phase >= 1 ? p.pct : "0%"), transition: "width 0.9s cubic-bezier(.4,0,.2,1), background 0.5s ease" }} />
          </div>
        </div>
      ))}
      {phase >= 2 && (
        <div style={{ animation: "ob-fadeup 0.4s ease both", background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 12, padding: "9px 12px", textAlign: "center" }}>
          {settled
            ? <span style={{ color: "#34d399", fontWeight: 700, fontSize: 12 }}>✓ Todos a cero · ¡Saldado!</span>
            : <span style={{ color: "#34d399", fontSize: 11 }}>Settly calculó 3 transferencias mínimas</span>}
        </div>
      )}
    </div>
  );
}

// ── Slide 6: More features — staggered grid ──────────────────────────────────
function Slide6Anim() {
  const t = useT();
  const cards = [
    { emoji: "📊", label: t("onboard.extra1"), detail: "Comida · Ocio · Viaje" },
    { emoji: "💱", label: t("onboard.extra2"), detail: "€ $ £ ¥ AUD..." },
    { emoji: "⚡", label: t("onboard.extra3"), detail: "Cambios al instante" },
    { emoji: "📜", label: t("onboard.extra4"), detail: "Comprobantes y recibos" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 280, margin: "0 auto" }}>
      {cards.map((c, i) => (
        <div key={i} style={{ animation: `ob-pop 0.4s cubic-bezier(.34,1.56,.64,1) ${i * 0.12}s both`, background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 10px", backdropFilter: "blur(8px)" }}>
          <div style={{ fontSize: 24, marginBottom: 5 }}>{c.emoji}</div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 11 }}>{c.label}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, marginTop: 2 }}>{c.detail}</div>
        </div>
      ))}
    </div>
  );
}

// ── Slide config ─────────────────────────────────────────────────────────────
const SLIDES = [
  { gradient: "linear-gradient(160deg, #120d36 0%, #3d2fa0 100%)", Animation: Slide1Anim, titleKey: "onboard.s1t", descKey: "onboard.s1d" },
  { gradient: "linear-gradient(160deg, #082a28 0%, #0a7060 100%)", Animation: Slide2Anim, titleKey: "onboard.s2t", descKey: "onboard.s2d" },
  { gradient: "linear-gradient(160deg, #3d1005 0%, #c2410c 100%)", Animation: Slide3Anim, titleKey: "onboard.s3t", descKey: "onboard.s3d" },
  { gradient: "linear-gradient(160deg, #08153d 0%, #0369a1 100%)", Animation: Slide4Anim, titleKey: "onboard.s4t", descKey: "onboard.s4d" },
  { gradient: "linear-gradient(160deg, #032014 0%, #059669 100%)", Animation: Slide5Anim, titleKey: "onboard.s5t", descKey: "onboard.s5d" },
  { gradient: "linear-gradient(160deg, #160836 0%, #6d28d9 100%)", Animation: Slide6Anim, titleKey: "onboard.s6t", descKey: "onboard.s6d" },
];

// ── Main component ────────────────────────────────────────────────────────────
export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  function next() { step < SLIDES.length - 1 ? setStep(s => s + 1) : onDone(); }
  function prev() { if (step > 0) setStep(s => s - 1); }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) dx < 0 ? next() : prev();
  }

  return (
    <>
      <style>{ANIM}</style>
      <div
        className="fixed inset-0 z-50 flex flex-col transition-all duration-700 select-none"
        style={{ background: slide.gradient }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Progress dots + skip */}
        <div className="flex items-center justify-between px-6 pt-12 pb-2 shrink-0">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setStep(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === step ? 28 : 8, background: i === step ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)" }}
              />
            ))}
          </div>
          {!isLast && (
            <button onClick={onDone} className="text-sm font-medium transition-colors" style={{ color: "rgba(255,255,255,0.5)" }}>
              {t("onboard.skip")}
            </button>
          )}
        </div>

        {/* Animation area */}
        <div key={step} className="flex-1 flex flex-col items-center justify-center px-6 pb-2 anim-up" style={{ gap: 20 }}>
          {step === 0 && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 24, padding: 16 }}>
              <Logo size={56} />
            </div>
          )}
          <slide.Animation />
        </div>

        {/* Text + CTA */}
        <div className="px-7 pb-11 shrink-0">
          <h2 className="font-display font-extrabold text-white text-center mb-1.5" style={{ fontSize: 22 }}>
            {t(slide.titleKey)}
          </h2>
          <p className="text-center text-sm leading-relaxed mb-5 max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.65)" }}>
            {t(slide.descKey)}
          </p>
          <button onClick={next} className="w-full rounded-full py-4 font-bold text-base hover-lift"
            style={{ background: "rgba(255,255,255,0.95)", color: "#120d36" }}>
            {isLast ? t("onboard.start") : t("onboard.next")}
          </button>
        </div>
      </div>
    </>
  );
}
