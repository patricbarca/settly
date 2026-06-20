import { useState, useRef } from "react";
import { useT } from "../lib/i18n";
import { Logo } from "./Logo";

type Slide = {
  gradient: string;
  emoji: string | null;
  titleKey: string;
  descKey: string;
  extras?: { emoji: string; key: string }[];
};

const SLIDES: Slide[] = [
  {
    gradient: "linear-gradient(160deg, #120d36 0%, #3d2fa0 100%)",
    emoji: null,
    titleKey: "onboard.s1t",
    descKey: "onboard.s1d",
  },
  {
    gradient: "linear-gradient(160deg, #082a28 0%, #0a7060 100%)",
    emoji: "👥",
    titleKey: "onboard.s2t",
    descKey: "onboard.s2d",
  },
  {
    gradient: "linear-gradient(160deg, #3d1005 0%, #c2410c 100%)",
    emoji: "📸",
    titleKey: "onboard.s3t",
    descKey: "onboard.s3d",
  },
  {
    gradient: "linear-gradient(160deg, #08153d 0%, #0369a1 100%)",
    emoji: "🎤",
    titleKey: "onboard.s4t",
    descKey: "onboard.s4d",
  },
  {
    gradient: "linear-gradient(160deg, #032014 0%, #059669 100%)",
    emoji: "💸",
    titleKey: "onboard.s5t",
    descKey: "onboard.s5d",
  },
  {
    gradient: "linear-gradient(160deg, #160836 0%, #6d28d9 100%)",
    emoji: "🏆",
    titleKey: "onboard.s6t",
    descKey: "onboard.s6d",
    extras: [
      { emoji: "📊", key: "onboard.extra1" },
      { emoji: "💱", key: "onboard.extra2" },
      { emoji: "⚡", key: "onboard.extra3" },
      { emoji: "📜", key: "onboard.extra4" },
    ],
  },
];

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  function next() {
    if (step < SLIDES.length - 1) setStep((s) => s + 1);
    else onDone();
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      if (dx < 0) next();
      else prev();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col transition-all duration-700"
      style={{ background: slide.gradient }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-12 pb-2 shrink-0">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "28px" : "8px",
                background: i === step ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>
        {!isLast && (
          <button
            onClick={onDone}
            className="text-white/55 text-sm font-medium hover:text-white/80 transition-colors"
          >
            {t("onboard.skip")}
          </button>
        )}
      </div>

      {/* Slide content */}
      <div key={step} className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-4 anim-up">
        {/* Icon */}
        <div className="mb-7">
          {slide.emoji ? (
            <span className="text-[80px] leading-none select-none">{slide.emoji}</span>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.12)" }}>
                <Logo size={72} />
              </div>
              <span className="font-display text-5xl font-extrabold text-white tracking-tight">
                Settly
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        {slide.emoji && (
          <h1 className="font-display text-3xl font-extrabold text-white mb-3 leading-tight">
            {t(slide.titleKey)}
          </h1>
        )}
        {!slide.emoji && (
          <h1 className="font-display text-2xl font-bold text-white mb-3 leading-tight">
            {t(slide.titleKey)}
          </h1>
        )}

        {/* Description */}
        <p className="text-white/75 text-base leading-relaxed max-w-sm">
          {t(slide.descKey)}
        </p>

        {/* Extras grid — last slide */}
        {slide.extras && (
          <div className="grid grid-cols-2 gap-2 mt-7 w-full max-w-xs">
            {slide.extras.map((ex) => (
              <div
                key={ex.key}
                className="rounded-2xl px-3 py-2.5 flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <span className="text-xl leading-none">{ex.emoji}</span>
                <span className="text-white/85 text-sm font-medium">{t(ex.key)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA button */}
      <div className="px-8 pb-12 shrink-0">
        <button
          onClick={next}
          className="w-full rounded-full py-4 font-bold text-base hover-lift transition-all"
          style={{ background: "rgba(255,255,255,0.95)", color: "#120d36" }}
        >
          {isLast ? t("onboard.start") : t("onboard.next")}
        </button>
      </div>
    </div>
  );
}
