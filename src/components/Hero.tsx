import { useState } from "react";
import type { Group } from "../lib/types";
import { groupSettleScore } from "../lib/gamification";
import { computeSettle } from "../lib/split";
import { useT } from "../lib/i18n";
import { useGroupMoney } from "../lib/displayCurrency";
import { SettleRing } from "./SettleRing";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function Hero({ group }: { group: Group }) {
  const t = useT();
  const money = useGroupMoney(group);
  const score = groupSettleScore(group);
  const direct = group.simplifyDebts === false;
  const [showModeInfo, setShowModeInfo] = useState(false);

  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);
  const mine = net[group.meId] || 0;
  const owe = mine < -0.01 ? -mine : 0;
  const owed = mine > 0.01 ? mine : 0;

  const total = group.expenses.reduce((sum, exp) => sum + exp.amount, 0);
  return (
    <div className="hero anim-up">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white/70 text-[11px] uppercase tracking-widest font-mono mb-1">{t("hero.groupLabel")}</div>
          <div className="text-white font-display text-2xl font-extrabold truncate leading-relaxed">{group.name}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold"
              style={{ background: "rgba(255,255,255,0.22)", color: "#FFFFFF" }}
            >
              T {money(total)}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold"
              style={{ background: "rgba(255,90,77,0.22)", color: "#FFC2BB" }}
            >
              ↓ {money(owe)}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold"
              style={{ background: "rgba(46,213,115,0.22)", color: "#9BF6C9" }}
            >
              ↑ {money(owed)}
            </span>
          </div>
          <button
            onClick={() => setShowModeInfo(true)}
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-white/70 hover-lift"
          >
            {direct ? t("hero.modeDirect") : t("hero.modeSimplified")}
            <Icon name="info" size={12} />
          </button>
        </div>
        <div className="text-center shrink-0 text-white">
          <SettleRing value={score} size={56} stroke={6} color="#7CF5EE" track="rgba(255,255,255,0.25)" />
          <div className="text-[9px] uppercase tracking-wide font-mono text-white/70 mt-1">{t("game.settleScore")}</div>
        </div>
      </div>
      {showModeInfo && (
        <Overlay onClose={() => setShowModeInfo(false)}>
          <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold mb-1">{t("hero.modeInfoTitle")}</h3>
            <p className="text-sm text-muted mb-1">
              {direct ? t("hero.modeInfoDirect") : t("hero.modeInfoSimplified")}
            </p>
            <p className="text-xs text-muted mb-4">{t("hero.modeChangeHint")}</p>
            <button
              onClick={() => setShowModeInfo(false)}
              className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift"
            >
              {t("common.close")}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
