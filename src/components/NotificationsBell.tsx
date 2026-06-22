import { useMemo, useState } from "react";
import { useGroups } from "../lib/store";
import { buildFeed, loadSeen, saveSeen, type FeedItem } from "../lib/notifications";
import { money } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { Icon } from "./Icon";

function relTime(ts: string, lang: "es" | "en") {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === "es" ? "ahora" : "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationsBell() {
  const t = useT();
  const lang = useLang();
  const groups = useGroups();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());

  const items = useMemo(() => buildFeed(groups), [groups]);
  const unread = items.filter((n) => !seen.has(n.id)).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items.length) {
      const s = new Set(seen);
      items.forEach((n) => s.add(n.id));
      setSeen(s);
      saveSeen(s);
    }
  }

  function message(n: FeedItem): string {
    const amt = n.amount != null ? money(n.amount, n.currency) : "";
    if (n.type === "expense_added")
      return t("notif.expense_added", { name: n.actorName ?? "?", label: n.label ?? "", amt });
    if (n.type === "payment_made")
      return t("notif.payment_made", { name: n.actorName ?? "?", amt, to: n.toName ?? "?" });
    return t("notif.review_requested", { label: n.label ?? "" });
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift relative"
        title={t("notif.title")}
      >
        <Icon name="bell" size={16} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: "var(--coral)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[85vw] glass-strong rounded-2xl p-2 z-50 anim-pop max-h-[70vh] overflow-y-auto shadow-xl">
            <div className="text-xs font-semibold text-muted px-2 py-1.5">{t("notif.title")}</div>
            {items.length === 0 ? (
              <div className="text-sm text-muted text-center py-6">{t("notif.empty")}</div>
            ) : (
              <div className="space-y-0.5">
                {items.map((n) => (
                  <div key={n.id} className="flex gap-2 items-start px-2 py-2 rounded-xl">
                    <span
                      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-muted"
                      style={{ background: "var(--glass)" }}
                    >
                      <Icon
                        name={n.type === "payment_made" ? "card" : n.type === "review_requested" ? "flag" : "plus"}
                        size={14}
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug">{message(n)}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {t("notif.in", { group: n.groupName })} · {relTime(n.ts, lang)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
