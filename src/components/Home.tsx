import { useState } from "react";
import { useGroups, setActiveGroup, archiveGroup } from "../lib/store";
import { computeSettle } from "../lib/split";
import { groupSettleScore } from "../lib/gamification";
import { money, personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { usePlan } from "../lib/plan";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { SettleRing } from "./SettleRing";
import { CreateGroupModal } from "./CreateGroupModal";
import { InstallButton } from "./InstallButton";
import { Paywall } from "./Paywall";
import type { Group } from "../lib/types";

export function Home() {
  const t = useT();
  const groups = useGroups();
  const plan = usePlan();
  const [creating, setCreating] = useState(false);
  const [showArch, setShowArch] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);

  const hasGroup = active.length > 0;
  const hasExpense = active.some((g) => g.expenses.length > 0);
  const hasSettlement = active.some((g) => (g.settlements ?? []).some((s) => s.status === "confirmed"));
  const allDone = hasGroup && hasExpense && hasSettlement;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <div className="pt-4">
        <div className="hero anim-up">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <div className="relative z-10 flex flex-col items-center text-center py-3">
            <div className="glass rounded-3xl p-3 mb-4">
              <Logo size={54} />
            </div>
            <h1 className="text-white font-display text-5xl font-extrabold tracking-tight">Settli<span className="text-[#7fe7e2]">A</span></h1>
            <p className="text-white/85 text-base mt-2.5 max-w-md leading-relaxed">{t("login.tagline")}</p>
            <button
              onClick={() => setCreating(true)}
              className="mt-5 rounded-full px-6 py-3 font-semibold hover-lift text-[#241C53] inline-flex items-center gap-1.5"
              style={{ background: "#fff" }}
            >
              <Icon name="plus" size={18} /> {t("home.createGroup")}
            </button>
          </div>
        </div>
      </div>

      {/* Install + upgrade row (each hides itself when not applicable) */}
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <InstallButton />
        {plan === "free" ? (
          <button
            onClick={() => setShowPaywall(true)}
            className="rounded-full px-3 py-1.5 text-sm font-semibold hover-lift inline-flex items-center gap-1.5 text-white"
            style={{ background: "linear-gradient(180deg,#6e6cf5,#5b5bf0)" }}
          >
            <Icon name="sparkles" size={15} /> {t("pro.upgrade")}
          </button>
        ) : (
          <span
            className="rounded-full px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5"
            style={{ background: "rgba(91,91,240,0.12)", color: "var(--indigo)" }}
          >
            <Icon name="sparkles" size={15} /> {t("pro.badge")}
          </span>
        )}
      </div>

      {/* Getting started checklist — shows until all 3 steps done */}
      {!allDone && (
        <div className="space-y-2 mt-6">
          <p className="text-xs font-semibold text-muted px-1 uppercase tracking-wide">{t("onboard.checklist")}</p>
          <StartStep
            n={1}
            done={hasGroup}
            active={!hasGroup}
            title={t("onboard.step1t")}
            desc={t("onboard.step1d")}
            action={!hasGroup ? () => setCreating(true) : undefined}
            actionLabel={t("home.createGroup")}
          />
          <StartStep
            n={2}
            done={hasExpense}
            active={hasGroup && !hasExpense}
            title={t("onboard.step2t")}
            desc={t("onboard.step2d")}
          />
          <StartStep
            n={3}
            done={hasSettlement}
            active={hasExpense && !hasSettlement}
            title={t("onboard.step3t")}
            desc={t("onboard.step3d")}
          />
        </div>
      )}

      <div className="flex items-center justify-between mt-6 mb-2 px-1">
        <h2 className="font-display text-xl font-bold">{t("home.yourGroups")}</h2>
        <button
          onClick={() => setCreating(true)}
          className="glass rounded-full px-3 py-1.5 text-sm hover-lift text-muted inline-flex items-center gap-1"
        >
          <Icon name="plus" size={15} /> {t("home.new")}
        </button>
      </div>

      <div className="space-y-2">
        {active.length === 0 && allDone && (
          <div className="glass rounded-3xl p-8 text-center text-muted">{t("home.empty")}</div>
        )}
        {active.map((g) => {
          const { net } = computeSettle(g.members, g.expenses, g.settlements ?? []);
          const mine = net[g.meId] || 0;
          const total = g.expenses.reduce((s, e) => s + e.amount, 0);
          const ok = Math.abs(mine) < 0.01;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              className="glass rounded-3xl p-4 w-full text-left hover-lift flex items-center gap-3"
            >
              <div className="shrink-0">
                <SettleRing value={groupSettleScore(g)} size={44} stroke={5} color="#0FA3A3" track="var(--line)" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-lg font-bold truncate">{g.name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {t("home.meta", { p: g.members.length, amt: money(total, g.currency), e: g.expenses.length })}
                </div>
                <div className="flex -space-x-2 mt-2">
                  {g.members.slice(0, 5).map((m) => (
                    <span
                      key={m.id}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2"
                      style={{ background: personColor(m.name) + "33", borderColor: "var(--ring)" }}
                    >
                      {memberInitials(m)}
                    </span>
                  ))}
                  {g.members.length > 5 && (
                    <span
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 text-muted"
                      style={{ background: "var(--glass)", borderColor: "var(--ring)" }}
                    >
                      +{g.members.length - 5}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] uppercase tracking-wide font-mono text-muted">{t("home.yourBalance")}</div>
                <div
                  className="font-mono font-bold"
                  style={{ color: ok ? "var(--muted)" : mine > 0 ? "#0A8B5E" : "#D14444" }}
                >
                  {ok ? t("bal.uptodate") : mine > 0 ? `+${money(mine, g.currency)}` : `−${money(-mine, g.currency)}`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArch((v) => !v)}
            className="lk text-sm font-medium inline-flex items-center gap-1"
          >
            <Icon name="chevron" size={14} style={{ transform: showArch ? "rotate(180deg)" : "none" }} />
            {t("home.archived")} ({archived.length})
          </button>
          {showArch && (
            <div className="space-y-1.5 mt-2">
              {archived.map((g) => {
                const total = g.expenses.reduce((s, e) => s + e.amount, 0);
                return (
                  <div key={g.id} className="glass rounded-3xl p-3 flex items-center gap-2" style={{ opacity: 0.8 }}>
                    <button onClick={() => setActiveGroup(g.id)} className="flex-1 text-left min-w-0">
                      <div className="font-semibold truncate">{g.name}</div>
                      <div className="text-xs text-muted">
                        {t("home.meta", { p: g.members.length, amt: money(total, g.currency), e: g.expenses.length })}
                      </div>
                    </button>
                    <button
                      onClick={() => archiveGroup(g.id, false)}
                      className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted shrink-0"
                    >
                      {t("home.restore")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </div>
  );
}

function StartStep({
  n, done, active, title, desc, action, actionLabel,
}: {
  n: number; done: boolean; active: boolean; title: string; desc: string;
  action?: () => void; actionLabel?: string;
}) {
  return (
    <div
      className="glass rounded-3xl px-4 py-3 flex items-center gap-3 transition-opacity"
      style={{ opacity: !active && !done ? 0.45 : 1 }}
    >
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={
          done
            ? { background: "#0A8B5E22", color: "#0A8B5E" }
            : active
            ? { background: "rgba(10,163,163,0.15)", color: "var(--teal)" }
            : { background: "var(--glass)", color: "var(--muted)" }
        }
      >
        {done ? <Icon name="check" size={15} /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${done ? "line-through text-muted" : ""}`}>{title}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {active && action && (
        <button
          onClick={action}
          className="glass-strong rounded-full px-3 py-1.5 text-xs font-semibold hover-lift shrink-0"
          style={{ color: "var(--teal)" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
