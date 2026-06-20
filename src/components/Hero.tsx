import type { Group } from "../lib/types";
import { computeSettle } from "../lib/split";
import { groupSettleScore } from "../lib/gamification";
import { money } from "../lib/format";
import { useT } from "../lib/i18n";
import { SettleRing } from "./SettleRing";

export function Hero({ group }: { group: Group }) {
  const t = useT();
  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);
  const mine = net[group.meId] || 0;
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const ok = Math.abs(mine) < 0.01;
  const score = groupSettleScore(group);

  return (
    <div className="hero anim-up">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <div className="relative z-10">
        <div className="text-white/70 text-[11px] uppercase tracking-widest font-mono mb-1">{t("hero.groupLabel")}</div>
        <div className="text-white font-display text-2xl font-extrabold truncate leading-tight">{group.name}</div>

        <div className="mt-5 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <div className="text-white/65 text-[11px] uppercase tracking-widest font-mono">{t("home.yourBalance")}</div>
            <div className="font-display text-4xl font-extrabold mt-1 leading-tight">
              {ok
                ? t("hero.uptodate")
                : mine > 0
                  ? t("hero.theyOwe", { amt: money(mine, group.currency) })
                  : t("hero.youOwe", { amt: money(-mine, group.currency) })}
            </div>
            <div className="text-white/75 text-sm mt-1.5">
              {t("hero.total", { amt: money(total, group.currency), e: group.expenses.length })}
            </div>
          </div>
          <div className="text-center shrink-0">
            <SettleRing value={score} size={62} stroke={7} color="#7CF5EE" track="rgba(255,255,255,0.25)" />
            <div className="text-[9px] uppercase tracking-wide font-mono text-white/70 mt-1">{t("game.settleScore")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
