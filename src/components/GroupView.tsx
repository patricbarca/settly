import { useState, useEffect } from "react";
import type { Group } from "../lib/types";
import { setActiveGroup, archiveGroup, processRecurring } from "../lib/store";
import { createInviteLink } from "../lib/invite";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Hero } from "./Hero";
import { Members } from "./Members";
import { AddExpense } from "./AddExpense";
import { Balances } from "./Balances";
import { ReadyToSettle } from "./ReadyToSettle";
import { Achievements } from "./Achievements";
import { CategoryChart } from "./CategoryChart";
import { ExpenseList } from "./ExpenseList";
import { Analytics } from "./Analytics";
import { GroupSettings } from "./GroupSettings";
import { UsersModal } from "./UsersModal";
import { ReportModal } from "./ReportModal";
import { Paywall } from "./Paywall";
import { ShareLinkModal } from "./ShareLinkModal";
import { isPro } from "../lib/plan";

type Tab = "expenses" | "balances" | "stats" | "achievements";

export function GroupView({ group }: { group: Group }) {
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [tab, setTab] = useState<Tab>("expenses");
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

  function openReport() {
    if (isPro()) setShowReport(true);
    else setPaywall(true);
  }

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [group.id]);
  useEffect(() => { processRecurring(group.id); }, [group.id]);

  async function share() {
    setInviteError(false);
    let link: string;
    try {
      link = await createInviteLink(group);
    } catch {
      // El fallo AQUÍ sí es "no se pudo crear el link" (red / sin sesión).
      setInviteError(true);
      setTimeout(() => setInviteError(false), 2500);
      return;
    }
    // Copia directa (funciona en escritorio/dentro de gesto). En iOS el gesto se
    // perdió con el await anterior → clipboard/share lanzan; caemos al modal,
    // donde el botón Copiar corre en su propio gesto y sí funciona.
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShareLink(link);
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
          <button onClick={openReport} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("report.title")}>
            <Icon name="doc" size={15} />
          </button>
          <button onClick={() => setShowSettings(true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("settings.title")}>
            <Icon name="settings" size={15} />
          </button>
          <button onClick={() => archiveGroup(group.id, true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("group.archive")}>
            <Icon name="archive" size={15} />
          </button>
        </div>
      </div>

      <Hero group={group} />

      <div className="mt-4">
        <Members group={group} />
      </div>

      {/* Share group card */}
      <div className="glass rounded-3xl px-4 py-3 mt-3 flex items-center justify-between gap-3">
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
      <div className="flex gap-1.5 my-4">
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-auto rounded-full px-3 py-2 text-sm font-semibold text-center whitespace-nowrap ${on ? "" : "glass text-muted"}`}
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
          <ExpenseList group={group} />
        </div>
      )}
      {tab === "balances" && (
        <div className="space-y-4 anim-up">
          <Balances group={group} />
          {group.kind !== "home" && <ReadyToSettle group={group} />}
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
      {showReport && <ReportModal group={group} onClose={() => setShowReport(false)} />}
      {paywall && <Paywall onClose={() => setPaywall(false)} reason={t("report.proReason")} />}
      {shareLink && <ShareLinkModal link={shareLink} title={group.name} onClose={() => setShareLink(null)} />}

    </div>
  );
}
