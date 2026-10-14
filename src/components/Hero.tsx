import { money as rawMoney } from "../lib/format";
import { useState } from "react";
import type { Group } from "../lib/types";
import { groupSettleScore } from "../lib/gamification";
import { computeSettle, settleOf, mainView, currencyViews } from "../lib/split";
import { useT } from "../lib/i18n";
import { useGroupMoney } from "../lib/displayCurrency";
import { SettleRing } from "./SettleRing";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function Hero({ group, onShare, shareState }: { group: Group; onShare?: () => void; shareState?: "copied" | "error" }) {
  const t = useT();
  const money = useGroupMoney(group);
  const score = groupSettleScore(group);
  const direct = group.simplifyDebts === false;
  const [showModeInfo, setShowModeInfo] = useState(false);

  const { net } = settleOf(mainView(group));
  const mine = net[group.meId] || 0;
  const owe = mine < -0.01 ? -mine : 0;
  const owed = mine > 0.01 ? mine : 0;

  const extra = currencyViews(group)
    .slice(1)
    .map((v) => ({ code: v.currency, mine: settleOf(v).net[group.meId] || 0 }));
  const total = mainView(group).expenses.reduce((sum, exp) => sum + exp.amount, 0);
  return (
    <div className="hero anim-up">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white/70 text-[11px] uppercase tracking-widest font-mono mb-1">{t("hero.groupLabel")}</div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-white font-display text-2xl font-extrabold truncate leading-relaxed min-w-0">{group.name}</div>
            {onShare && (
              <button
                onClick={onShare}
                className="shrink-0 h-6 min-w-6 rounded-full px-1.5 inline-flex items-center justify-center gap-1 text-[10px] font-semibold hover-lift"
                style={{ background: "rgba(255,255,255,0.22)", color: shareState === "error" ? "#FFC2BB" : "#FFFFFF" }}
                title={t("hero.share")}
                aria-label={t("hero.share")}
              >
                <Icon name={shareState === "copied" ? "check" : "share"} size={12} />
                {shareState === "copied" ? t("group.copied") : shareState === "error" ? t("group.inviteError") : null}
              </button>
            )}
          </div>
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
          {/* Saldos separados por moneda: mi saldo en cada moneda extra. */}
          {extra.map((x) => (
            <div key={x.code} className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-mono font-bold text-white/70 w-8">{x.code}</span>
              {x.mine < -0.01 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold" style={{ background: "rgba(255,90,77,0.22)", color: "#FFC2BB" }}>
                  ↓ {rawMoney(-x.mine, x.code)}
                </span>
              )}
              {x.mine > 0.01 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold" style={{ background: "rgba(46,213,115,0.22)", color: "#9BF6C9" }}>
                  ↑ {rawMoney(x.mine, x.code)}
                </span>
              )}
              {Math.abs(x.mine) <= 0.01 && <span className="text-[11px] text-white/70">✓</span>}
            </div>
          ))}
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
