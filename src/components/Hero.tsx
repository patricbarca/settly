import type { Group } from "../lib/types";
import { groupSettleScore } from "../lib/gamification";
import { computeSettle } from "../lib/split";
import { money } from "../lib/format";
import { useT } from "../lib/i18n";
import { SettleRing } from "./SettleRing";

export function Hero({ group }: { group: Group }) {
  const t = useT();
  const score = groupSettleScore(group);

  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);
  const mine = net[group.meId] || 0;
  const owe = mine < -0.01 ? -mine : 0;
  const owed = mine > 0.01 ? mine : 0;

  return (
    <div className="hero anim-up">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white/70 text-[11px] uppercase tracking-widest font-mono mb-1">{t("hero.groupLabel")}</div>
          <div className="text-white font-display text-2xl font-extrabold truncate leading-tight">{group.name}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold"
              style={{ background: "rgba(255,90,77,0.22)", color: "#FFC2BB" }}
            >
              ↓ {money(owe, group.currency)}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold"
              style={{ background: "rgba(46,213,115,0.22)", color: "#9BF6C9" }}
            >
              ↑ {money(owed, group.currency)}
            </span>
          </div>
        </div>
        <div className="text-center shrink-0 text-white">
          <SettleRing value={score} size={56} stroke={6} color="#7CF5EE" track="rgba(255,255,255,0.25)" />
          <div className="text-[9px] uppercase tracking-wide font-mono text-white/70 mt-1">{t("game.settleScore")}</div>
        </div>
      </div>
    </div>
  );
}
