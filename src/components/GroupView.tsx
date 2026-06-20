import { useState, useEffect } from "react";
import type { Group } from "../lib/types";
import { setActiveGroup, deleteGroup, archiveGroup, processRecurring } from "../lib/store";
import { computeSettle } from "../lib/split";
import { createInviteLink } from "../lib/invite";
import { money } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Overlay } from "./Overlay";
import { Hero } from "./Hero";
import { Members } from "./Members";
import { AddExpense } from "./AddExpense";
import { Balances } from "./Balances";
import { ReadyToSettle } from "./ReadyToSettle";
import { Achievements } from "./Achievements";
import { CategoryChart } from "./CategoryChart";
import { ExpenseList } from "./ExpenseList";
import { Analytics } from "./Analytics";
import { RecurringList } from "./RecurringList";
import { GroupSettings } from "./GroupSettings";
import { UsersModal } from "./UsersModal";

type Tab = "expenses" | "balances" | "stats" | "achievements";

export function GroupView({ group }: { group: Group }) {
  const t = useT();
  const [confirmDel, setConfirmDel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [tab, setTab] = useState<Tab>("expenses");
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState(false);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [group.id]);
  useEffect(() => { processRecurring(group.id); }, [group.id]);

  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);
  const mine = net[group.meId] || 0;
  const ok = Math.abs(mine) < 0.01;

  async function share() {
    setInviteError(false);
    try {
      const link = await createInviteLink(group.id);
      if (navigator.share) {
        await navigator.share({ title: group.name, text: `Únete al grupo "${group.name}" en Settly`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setInviteError(true);
        setTimeout(() => setInviteError(false), 2500);
      }
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "expenses", label: t("tab.expenses") },
    { id: "balances", label: t("tab.balances") },
    { id: "stats", label: t("tab.stats") },
    { id: "achievements", label: t("tab.achievements") },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <div className="flex items-center justify-between pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="glass rounded-2xl p-1">
            <Logo size={24} />
          </div>
          <button onClick={() => setActiveGroup(null)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("group.back")}>
            <Icon name="back" size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowUsers(true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("users.title")}>
            <Icon name="users" size={15} />
          </button>
          <button onClick={() => setShowSettings(true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("settings.title")}>
            <Icon name="settings" size={15} />
          </button>
          <button onClick={() => archiveGroup(group.id, true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("group.archive")}>
            <Icon name="archive" size={15} />
          </button>
          <button onClick={() => setConfirmDel(true)} className="glass rounded-full h-8 w-8 flex items-center justify-center hover-lift" title={t("group.delete")} style={{ color: "#D14444" }}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <Hero group={group} />

      {/* Balance card — visual, no labels */}
      <div
        className="rounded-2xl p-4 mt-3 flex items-center gap-4"
        style={{
          background: ok ? "rgba(10,163,163,0.08)" : mine > 0 ? "rgba(10,139,94,0.08)" : "rgba(209,68,68,0.08)",
          border: `1.5px solid ${ok ? "rgba(10,163,163,0.15)" : mine > 0 ? "rgba(10,139,94,0.15)" : "rgba(209,68,68,0.15)"}`,
        }}
      >
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: ok ? "rgba(10,163,163,0.18)" : mine > 0 ? "rgba(10,139,94,0.18)" : "rgba(209,68,68,0.18)",
            color: ok ? "var(--teal)" : mine > 0 ? "#0A8B5E" : "#D14444",
          }}
        >
          {ok ? <Icon name="check" size={26} strokeWidth={2.5} /> : <span className="text-2xl font-bold">{mine > 0 ? "↑" : "↓"}</span>}
        </div>
        <div
          className="font-display text-3xl font-extrabold leading-none"
          style={{ color: ok ? "var(--teal)" : mine > 0 ? "#0A8B5E" : "#D14444" }}
        >
          {ok
            ? t("hero.uptodate")
            : mine > 0
              ? `+${money(mine, group.currency)}`
              : `−${money(-mine, group.currency)}`}
        </div>
      </div>

      <div className="mt-4">
        <Members group={group} />
      </div>

      {/* Share group card */}
      <div className="glass rounded-2xl px-4 py-3 mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t("group.shareTitle")}</div>
          <div className="text-xs text-muted mt-0.5">{t("group.shareHint")}</div>
        </div>
        <button
          onClick={share}
          className="glass-strong rounded-full px-4 py-2 text-sm font-semibold hover-lift inline-flex items-center gap-1.5 shrink-0"
          style={inviteError ? { color: "#D14444" } : copied ? { color: "#0A8B5E" } : { color: "var(--teal)" }}
        >
          <Icon name="copy" size={14} />
          {inviteError ? t("group.inviteError") : copied ? t("group.copied") : t("group.shareBtn")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 my-4 flex-wrap">
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${on ? "" : "glass text-muted"}`}
              style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
            >
              {tb.label}
            </button>
          );
        })}
      </div>

      {tab === "expenses" && (
        <div className="space-y-4 anim-up">
          <AddExpense group={group} />
          <RecurringList group={group} />
          <ExpenseList group={group} />
        </div>
      )}
      {tab === "balances" && (
        <div className="space-y-4 anim-up">
          <Balances group={group} />
          <ReadyToSettle group={group} />
        </div>
      )}
      {tab === "stats" && (
        <div className="space-y-4 anim-up">
          <CategoryChart group={group} />
          <Analytics group={group} />
        </div>
      )}
      {tab === "achievements" && (
        <div className="space-y-4 anim-up">
          <Achievements group={group} />
        </div>
      )}

      {showUsers && <UsersModal group={group} onClose={() => setShowUsers(false)} />}
      {showSettings && <GroupSettings group={group} onClose={() => setShowSettings(false)} />}

      {confirmDel && (
        <Overlay onClose={() => setConfirmDel(false)}>
          <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop text-center" onClick={(e) => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-2" style={{ background: "#D1444418", color: "#D14444" }}>
              <Icon name="trash" size={22} />
            </div>
            <h3 className="font-display text-xl font-bold">{t("group.deleteQ", { name: group.name })}</h3>
            <p className="text-sm text-muted mt-1">{t("group.deleteWarn")}</p>
            <div className="flex gap-2 mt-4 justify-center">
              <button onClick={() => setConfirmDel(false)} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
                {t("common.cancel")}
              </button>
              <button
                onClick={() => deleteGroup(group.id)}
                className="rounded-full px-5 py-2.5 text-white font-medium hover-lift"
                style={{ background: "#D14444" }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
