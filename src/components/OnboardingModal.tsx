import { useState } from "react";
import { useT } from "../lib/i18n";
import { Overlay } from "./Overlay";

const SLIDES = [
  { emoji: "👥", titleKey: "onboard.s1t", descKey: "onboard.s1d" },
  { emoji: "🎤", titleKey: "onboard.s2t", descKey: "onboard.s2d" },
  { emoji: "✅", titleKey: "onboard.s3t", descKey: "onboard.s3d" },
];

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);

  function next() {
    if (step < SLIDES.length - 1) setStep((s) => s + 1);
    else onDone();
  }

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <Overlay onClose={onDone}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-8 anim-pop text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div key={step} className="anim-up">
          <div className="text-7xl mb-5 select-none">{slide.emoji}</div>
          <h2 className="font-display text-2xl font-bold mb-2">{t(slide.titleKey)}</h2>
          <p className="text-muted text-sm leading-relaxed mb-8 max-w-xs mx-auto">
            {t(slide.descKey)}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "24px" : "8px",
                background: i === step ? "var(--teal)" : "var(--line)",
              }}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full rounded-full px-4 py-3 font-semibold text-white hover-lift"
          style={{ background: "var(--ink)" }}
        >
          {isLast ? t("onboard.start") : t("onboard.next")}
        </button>

        {!isLast && (
          <button onClick={onDone} className="lk text-sm w-full text-center mt-3 text-muted">
            {t("onboard.skip")}
          </button>
        )}
      </div>
    </Overlay>
  );
}
