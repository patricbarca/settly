import type { Group } from "../lib/types";
import { groupSettleScore } from "../lib/gamification";
import { useT } from "../lib/i18n";
import { SettleRing } from "./SettleRing";

export function Hero({ group }: { group: Group }) {
  const t = useT();
  const score = groupSettleScore(group);

  return (
    <div className="hero anim-up">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white/70 text-[11px] uppercase tracking-widest font-mono mb-1">{t("hero.groupLabel")}</div>
          <div className="text-white font-display text-2xl font-extrabold truncate leading-tight">{group.name}</div>
        </div>
        <div className="text-center shrink-0 text-white">
          <SettleRing value={score} size={56} stroke={6} color="#7CF5EE" track="rgba(255,255,255,0.25)" />
          <div className="text-[9px] uppercase tracking-wide font-mono text-white/70 mt-1">{t("game.settleScore")}</div>
        </div>
      </div>
    </div>
  );
}
