import { useState, useEffect, useRef } from "react";
import { useT } from "../lib/i18n";
import { Logo } from "./Logo";
import { InstallGuide } from "./InstallGuide";
import { InstallDemoAnim } from "./InstallDemoAnim";

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
  const t = useT();
  return (
    <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", position: "relative", height: 170 }}>
      <div style={{ animation: "ob-float 3.2s ease-in-out infinite", position: "absolute", top: 0, left: 0, right: 0 }}>
        <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: "11px 14px", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>✈️ {t("onboard.demo.group1")}</span>
            <span style={{ color: "#34d399", fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>+$24.50</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["S","#7c3aed"],["A","#0891b2"],["P","#dc2626"],["J","#d97706"]].map(([l,c],i) => (
              <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: `${c}44`, border: `2px solid ${c}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ animation: "ob-float 4s ease-in-out infinite", animationDelay: "1.4s", position: "absolute", top: 88, left: 12, right: 12 }}>
        <div style={{ background: "rgba(255,255,255,0.09)", borderRadius: 14, padding: "9px 12px", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 12 }}>🏠 {t("onboard.demo.group2")}</span>
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>−$38.00</span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {[["S","#7c3aed"],["A","#059669"],["P","#0891b2"]].map(([l,c],i) => (
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
  const t = useT();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [900, 650, 650, 650, 2200];
    const timer = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 900);
    return () => clearTimeout(timer);
  }, [phase]);

  const members = [
    { name: t("onboard.demo.you"), color: "#7c3aed" },
    { name: "Siena", color: "#0891b2" },
    { name: "Alexa", color: "#dc2626" },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 280, margin: "0 auto" }}>
      <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t("onboard.demo.dinner")}</div>
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
            <span style={{ marginLeft: "auto", color: "#34d399", fontSize: 11, fontWeight: 700 }}>{t("onboard.demo.copy")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI badge overlay: reused on the 3 AI-powered slides ─────────────────────
function AiBadge() {
  const t = useT();
  return (
    <div
      style={{
        position: "absolute",
        top: -10,
        right: -6,
        background: "rgba(124,58,237,0.9)",
        color: "white",
        fontSize: 10,
        fontWeight: 800,
        borderRadius: 999,
        padding: "3px 9px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
        whiteSpace: "nowrap",
      }}
    >
      ✨ {t("app.poweredAI")}
    </div>
  );
}

// ── Slide: choose who's in — payer + participants + split modes ─────────────
function SlideSplitAnim() {
  const t = useT();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [1400, 1400, 1400, 2400];
    const timer = setTimeout(() => setPhase((p) => (p + 1) % delays.length), delays[phase] ?? 1400);
    return () => clearTimeout(timer);
  }, [phase]);

  const ava = (l: string, c: string) => (
    <div style={{ width: 20, height: 20, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "white", fontWeight: 700 }}>{l}</div>
  );
  const modes = ["=", "%", "$", "×"];

  return (
    <div style={{ width: "100%", maxWidth: 280, margin: "0 auto" }}>
      <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("form.paid")}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["S", "#7c3aed"], ["A", "#0891b2"], ["P", "#dc2626"]].map(([l, c], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: i === 0 ? `${c}33` : "rgba(255,255,255,0.08)", border: i === 0 ? `1.5px solid ${c}88` : "1.5px solid transparent", borderRadius: 999, padding: "3px 8px 3px 3px" }}>
              {ava(l, c)}
            </div>
          ))}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("form.between")}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["S", "#7c3aed"], ["A", "#0891b2"], ["P", "#dc2626"]].map(([l, c], i) => (
            <div key={i} style={{ opacity: phase >= 1 ? 1 : 0.35, transition: "opacity 0.3s" }}>{ava(l, c)}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {modes.map((m, i) => (
            <div
              key={m}
              style={{
                width: 30, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800, color: phase === i ? "#120d36" : "white",
                background: phase === i ? "white" : "rgba(255,255,255,0.1)", transition: "all 0.3s",
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Slide: Simplified vs Direct settle-up mode ───────────────────────────────
function SlideModeAnim() {
  const t = useT();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setOn((v) => !v), 1900);
    return () => clearTimeout(timer);
  }, [on]);

  return (
    <div style={{ width: "100%", maxWidth: 280, margin: "0 auto" }}>
      <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[t("hero.modeSimplified"), t("hero.modeDirect")].map((label, i) => (
            <div
              key={label}
              style={{
                borderRadius: 12, padding: "8px 6px", textAlign: "center", fontWeight: 800, fontSize: 12,
                background: (i === 0) === !on ? "white" : "rgba(255,255,255,0.1)",
                color: (i === 0) === !on ? "#120d36" : "white",
                transition: "all 0.4s",
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div style={{ animation: "ob-fadeup 0.3s ease both", color: "rgba(255,255,255,0.75)", fontSize: 11.5, lineHeight: 1.5, minHeight: 54 }}>
          {!on ? t("hero.modeInfoSimplified") : t("hero.modeInfoDirect")}
        </div>
      </div>
    </div>
  );
}

// ── Slide 3: Receipt scan ────────────────────────────────────────────────────
function Slide3Anim() {
  const t = useT();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [600, 2000, 1800, 2400];
    const timer = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 600);
    return () => clearTimeout(timer);
  }, [phase]);

  const items = [
    { name: "Pasta carbonara", price: "$14.50" },
    { name: "Pizza margherita", price: "$12.00" },
    { name: "Vino tinto ×2",   price: "$22.00" },
    { name: "Agua con gas",    price: "$4.50"  },
  ];

  if (phase >= 2) {
    return (
      <div style={{ width: "100%", maxWidth: 260, margin: "0 auto", animation: "ob-pop 0.5s cubic-bezier(.34,1.56,.64,1) both" }}>
        <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{t("onboard.demo.detected")}</div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{t("onboard.demo.restaurant")}</div>
          <div style={{ color: "#34d399", fontWeight: 800, fontSize: 24, fontFamily: "monospace", marginBottom: 10 }}>$53.00</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[[t("onboard.demo.you"),"$17.67","#7c3aed"],["Siena","$17.67","#0891b2"],["Alexa","$17.66","#dc2626"]].map(([n,a,c],i) => (
              <div key={i} style={{ flex: 1, background: `${c}22`, border: `1px solid ${c}44`, borderRadius: 8, padding: "5px 4px", textAlign: "center", animation: `ob-fadeup 0.3s ease ${i * 0.1 + 0.1}s both` }}>
                <div style={{ color: "white", fontSize: 9, fontWeight: 700 }}>{n}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, fontFamily: "monospace" }}>{a}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(52,211,153,0.18)", borderRadius: 8, padding: "6px 8px", textAlign: "center", color: "#34d399", fontSize: 11, fontWeight: 700 }}>
            {t("onboard.demo.addGroup")}
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
          <span>TOTAL</span><span>$53.00</span>
        </div>
      </div>
      {phase === 1 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent 0%, rgba(0,220,200,0.9) 40%, rgba(0,220,200,0.9) 60%, transparent 100%)", boxShadow: "0 0 8px rgba(0,220,200,0.7)", animation: "ob-scan 1.7s linear forwards", pointerEvents: "none" }} />
      )}
    </div>
  );
}

// ── Slide 4: Voice to text ───────────────────────────────────────────────────
function Slide4Anim() {
  const t = useT();
  const voiceSentence = t("onboard.demo.voiceText");
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const delays = [800, 2000, 2900, 2400];
    const timer = setTimeout(() => setPhase(p => (p + 1) % delays.length), delays[phase] ?? 800);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 2) {
      setTyped("");
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setTyped(voiceSentence.slice(0, i));
        if (i >= voiceSentence.length) clearInterval(iv);
      }, 45);
      return () => clearInterval(iv);
    }
    if (phase === 0) setTyped("");
  }, [phase, voiceSentence]);

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
          {phase === 2 && typed.length < voiceSentence.length && <span style={{ animation: "ob-pulse 0.8s ease-in-out infinite" }}>|</span>}
        </div>
      )}

      {/* Result expense card */}
      {phase === 3 && (
        <div style={{ animation: "ob-pop 0.45s cubic-bezier(.34,1.56,.64,1) both", background: "rgba(255,255,255,0.13)", borderRadius: 14, padding: "10px 14px", width: "100%", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>{t("onboard.demo.voiceTitle")}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>{t("onboard.demo.voiceMeta")}</div>
            </div>
            <div style={{ color: "#34d399", fontWeight: 800, fontSize: 18, fontFamily: "monospace" }}>$90</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slide 5: Settle up — pay with details, mark paid, validate ────────────────
function Slide5Anim() {
  const t = useT();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const delays = [1800, 2000, 2600];
    const timer = setTimeout(() => setPhase((p) => (p + 1) % delays.length), delays[phase] ?? 1800);
    return () => clearTimeout(timer);
  }, [phase]);

  const ava = (l: string, c: string) => (
    <div style={{ width: 22, height: 22, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700 }}>{l}</div>
  );

  return (
    <div style={{ width: "100%", maxWidth: 290, margin: "0 auto" }}>
      <div style={{ background: "rgba(255,255,255,0.13)", borderRadius: 16, padding: 14, backdropFilter: "blur(8px)" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{t("onboard.demo.toSettle")}</div>

        {/* Patrick pays Siena $18 */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          {ava("P", "#dc2626")}
          <b style={{ color: "white", fontSize: 12 }}>Patrick</b>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{t("onboard.demo.paysTo")}</span>
          {ava("S", "#0891b2")}
          <b style={{ color: "white", fontSize: 12 }}>Siena</b>
          <span style={{ marginLeft: "auto", fontFamily: "monospace", fontWeight: 800, color: "white", fontSize: 14 }}>$18</span>
        </div>

        {/* actions → states */}
        {phase === 0 && (
          <div style={{ animation: "ob-fadeup 0.3s ease both" }}>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 6, marginBottom: 8 }}>
              {[["Cena", "$14"], ["Vino", "$4"]].map(([label, amt]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px" }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#06281c", fontWeight: 900 }}>✓</div>
                  <span style={{ color: "white", fontSize: 10.5, flex: 1 }}>{label}</span>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 10.5, fontFamily: "monospace" }}>{amt}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ background: "#34d399", color: "#06281c", fontWeight: 700, fontSize: 11, borderRadius: 999, padding: "5px 14px" }}>{t("pay.pay")}</span>
              <span style={{ background: "rgba(255,255,255,0.14)", color: "white", fontWeight: 600, fontSize: 11, borderRadius: 999, padding: "5px 14px" }}>{t("pay.method")}</span>
            </div>
          </div>
        )}
        {phase === 1 && (
          <div style={{ animation: "ob-fadeup 0.3s ease both", background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.85)" }}>
            ⏳ {t("onboard.demo.markedPaid")}
          </div>
        )}
        {phase >= 2 && (
          <div style={{ animation: "ob-pop 0.4s cubic-bezier(.34,1.56,.64,1) both", background: "rgba(52,211,153,0.18)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 10, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#34d399" }}>
            ✓ {t("onboard.demo.validated")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide 6: More features — staggered grid ──────────────────────────────────
function Slide6Anim() {
  const t = useT();
  const cards = [
    { emoji: "💱", label: t("onboard.extra2"), detail: "$ € £ ¥ AUD" },
    { emoji: "🌐", label: t("onboard.extra5"), detail: "Español · English" },
    { emoji: "🔔", label: t("onboard.extra6"), detail: t("onboard.demo.detail6") },
    { emoji: "💳", label: t("onboard.extra7"), detail: t("onboard.demo.detail7") },
    { emoji: "🔁", label: t("onboard.extra8"), detail: t("onboard.demo.detail8") },
    { emoji: "📊", label: t("onboard.extra1"), detail: t("onboard.demo.detail1") },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 300, margin: "0 auto" }}>
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

// ── Slide: type it (text → AI) + manual ─────────────────────────────────────
function SlideTypeAnim() {
  const t = useT();
  const sentence = t("onboard.demo.typeText");
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const delays = [1800, 2000, 2600];
    const timer = setTimeout(() => setPhase((p) => (p + 1) % delays.length), delays[phase] ?? 700);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === 0) {
      setTyped("");
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setTyped(sentence.slice(0, i));
        if (i >= sentence.length) clearInterval(iv);
      }, 55);
      return () => clearInterval(iv);
    }
  }, [phase, sentence]);
  return (
    <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.13)", borderRadius: 14, padding: "11px 14px", color: "white", fontSize: 13, minHeight: 44, display: "flex", alignItems: "center", backdropFilter: "blur(8px)" }}>
          {typed || <span style={{ opacity: 0.4 }}>{t("onboard.demo.typePlaceholder")}</span>}
          {phase === 0 && typed.length < sentence.length && <span style={{ animation: "ob-pulse 0.8s ease-in-out infinite" }}>|</span>}
        </div>
        <div style={{ background: "white", color: "#120d36", borderRadius: 14, padding: "0 15px", display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>✨ {t("add.add")}</div>
      </div>
      {phase >= 2 && (
        <div style={{ animation: "ob-pop 0.45s cubic-bezier(.34,1.56,.64,1) both", background: "rgba(255,255,255,0.13)", borderRadius: 14, padding: "11px 14px", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>☕ {t("onboard.demo.typeTitle")}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>{t("onboard.demo.typeMeta")}</div>
            </div>
            <div style={{ color: "#34d399", fontWeight: 800, fontSize: 18, fontFamily: "monospace" }}>$12</div>
          </div>
        </div>
      )}
      <div style={{ textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 11 }}>✋ {t("onboard.demo.orManual")}</div>
    </div>
  );
}

// ── Slide config ─────────────────────────────────────────────────────────────
// Todos los slides comparten el MISMO color arriba (#0b0a1f) para que la barra
// de estado de iOS —que no se actualiza por slide— coincida siempre con el top.
// El color característico de cada slide entra a partir del ~18%.
const SLIDES = [
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #120d36 18%, #3d2fa0 100%)", Animation: Slide1Anim, titleKey: "onboard.s1t", descKey: "onboard.s1d" },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #082a28 18%, #0a7060 100%)", Animation: Slide2Anim, titleKey: "onboard.s2t", descKey: "onboard.s2d" },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #3d0a2a 18%, #be185d 100%)", Animation: SlideSplitAnim, titleKey: "onboard.sSplitT", descKey: "onboard.sSplitD" },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #3d1005 18%, #c2410c 100%)", Animation: Slide3Anim, titleKey: "onboard.s3t", descKey: "onboard.s3d", ai: true },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #08153d 18%, #0369a1 100%)", Animation: Slide4Anim, titleKey: "onboard.s4t", descKey: "onboard.s4d", ai: true },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #2a0a3d 18%, #7c3aed 100%)", Animation: SlideTypeAnim, titleKey: "onboard.sTypeT", descKey: "onboard.sTypeD", ai: true },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #3d2905 18%, #b45309 100%)", Animation: SlideModeAnim, titleKey: "onboard.sModeT", descKey: "onboard.sModeD" },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #032014 18%, #059669 100%)", Animation: Slide5Anim, titleKey: "onboard.s5t", descKey: "onboard.s5d" },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #160836 18%, #6d28d9 100%)", Animation: Slide6Anim, titleKey: "onboard.s6t", descKey: "onboard.s6d" },
  { gradient: "linear-gradient(160deg, #0b0a1f 0%, #061a33 18%, #0e7490 100%)", Animation: InstallDemoAnim, titleKey: "install.guideTitle", descKey: "install.guideDesc", guide: true },
];

// ── Main component ────────────────────────────────────────────────────────────
export function OnboardingModal({ onDone, canSkip = true }: { onDone: () => void; canSkip?: boolean }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  // La barra de estado (status bar / barra del navegador) se tiñe con el meta
  // theme-color. Mientras dura el onboarding, lo igualamos al color superior de
  // cada slide para que la franja de arriba coincida con el fondo. Al cerrar,
  // restauramos el color original de la app.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const original = meta.getAttribute("content");
    return () => { if (original !== null) meta.setAttribute("content", original); };
  }, []);
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const top = slide.gradient.match(/#[0-9a-fA-F]{3,8}/)?.[0];
    if (meta && top) meta.setAttribute("content", top);
  }, [slide]);

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
        className="fixed inset-0 z-50 flex flex-col items-center transition-all duration-700 select-none"
        style={{
          background: slide.gradient,
          paddingTop: "max(env(safe-area-inset-top), 20px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Progress dots + skip */}
        <div className="w-full max-w-sm flex items-center justify-between px-7 pt-2 pb-4 shrink-0">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => (canSkip || i <= step) && setStep(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === step ? 28 : 8, background: i === step ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)" }}
              />
            ))}
          </div>
          {!isLast && canSkip && (
            <button onClick={onDone} className="text-sm font-medium transition-colors" style={{ color: "rgba(255,255,255,0.5)" }}>
              {t("onboard.skip")}
            </button>
          )}
        </div>

        {/* Animation area */}
        <div key={step} className="w-full max-w-sm flex-1 flex flex-col items-center justify-center px-7 anim-up" style={{ gap: 20 }}>
          {step === 0 && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 24, padding: 16 }}>
              <Logo size={56} />
            </div>
          )}
          <div style={{ position: "relative", width: "100%", maxWidth: 300, margin: "0 auto" }}>
            {"ai" in slide && slide.ai && <AiBadge />}
            <slide.Animation />
          </div>
        </div>

        {/* Text + CTA */}
        <div className="w-full max-w-sm px-7 pt-6 pb-2 shrink-0">
          <h2 className="font-display font-extrabold text-white text-center mb-1.5" style={{ fontSize: 22 }}>
            {t(slide.titleKey)}
          </h2>
          <p className="text-center text-sm leading-relaxed mb-5 max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.65)" }}>
            {t(slide.descKey)}
          </p>
          {"guide" in slide && slide.guide && (
            <div className="mb-5">
              <InstallGuide dark />
            </div>
          )}
          <button onClick={next} className="w-full rounded-full py-4 font-bold text-base hover-lift"
            style={{ background: "rgba(255,255,255,0.95)", color: "#120d36" }}>
            {isLast ? t("onboard.start") : t("onboard.next")}
          </button>
        </div>
      </div>
    </>
  );
}
