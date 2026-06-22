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
        <div className="fixed inset-0 z-50 flex flex-col anim-up" style={{ background: "var(--bg)" }}>
          <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setOpen(false)}
                className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted hover-lift"
                title={t("common.back")}
              >
                <Icon name="back" size={16} />
              </button>
              <h2 className="font-display text-2xl font-bold">{t("notif.title")}</h2>
            </div>

            <div className="flex-1 overflow-y-auto pb-10">
              {items.length === 0 ? (
                <div className="glass rounded-3xl p-10 text-center text-muted mt-2">{t("notif.empty")}</div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((n) => (
                    <div key={n.id} className="glass rounded-2xl flex gap-3 items-start px-4 py-3">
                      <span
                        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-muted"
                        style={{ background: "var(--glass)" }}
                      >
                        <Icon
                          name={n.type === "payment_made" ? "card" : n.type === "review_requested" ? "flag" : "plus"}
                          size={16}
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
          </div>
        </div>
      )}
    </div>
  );
}
