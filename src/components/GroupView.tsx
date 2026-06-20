import { useState } from "react";
import type { Group } from "../lib/types";
import { setActiveGroup, deleteGroup, archiveGroup } from "../lib/store";
import { createInviteLink } from "../lib/invite";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Hero } from "./Hero";
import { Members } from "./Members";
import { AddExpense } from "./AddExpense";
import { Balances } from "./Balances";
import { ReadyToSettle } from "./ReadyToSettle";
import { Achievements } from "./Achievements";
import { CategoryChart } from "./CategoryChart";
import { ExpenseList } from "./ExpenseList";

type Tab = "expenses" | "balances" | "achievements";

export function GroupView({ group }: { group: Group }) {
  const t = useT();
  const [confirmDel, setConfirmDel] = useState(false);
  const [tab, setTab] = useState<Tab>("expenses");
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState(false);

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
    { id: "achievements", label: t("tab.achievements") },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <div className="flex items-center justify-between pt-4 pb-3">
        <button onClick={() => setActiveGroup(null)} className="lk text-sm font-medium inline-flex items-center gap-1">
          <Icon name="back" size={16} /> {t("group.back")}
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => archiveGroup(group.id, true)} className="lk text-sm inline-flex items-center gap-1">
            <Icon name="archive" size={14} /> {t("group.archive")}
          </button>
          <button onClick={() => setConfirmDel(true)} className="lk lk-danger text-sm inline-flex items-center gap-1">
            <Icon name="trash" size={14} /> {t("group.delete")}
          </button>
        </div>
      </div>

      {/* Siempre visibles: saldo + Settle Score, y todos los integrantes */}
      <Hero group={group} />
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

      {/* Pestañas */}
      <div className="flex gap-1 glass rounded-full p-1 my-4">
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold ${on ? "" : "text-muted"}`}
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
          <CategoryChart group={group} />
          <ExpenseList group={group} />
        </div>
      )}
      {tab === "balances" && (
        <div className="space-y-4 anim-up">
          <Balances group={group} />
          <ReadyToSettle group={group} />
        </div>
      )}
      {tab === "achievements" && (
        <div className="space-y-4 anim-up">
          <Achievements group={group} />
        </div>
      )}

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
