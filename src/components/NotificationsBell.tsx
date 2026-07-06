import { useMemo, useState } from "react";
import { useGroups } from "../lib/store";
import { buildFeed, loadSeen, saveSeen, type FeedItem } from "../lib/notifications";
import { buildActivity, type ActivityItem } from "../lib/activity";
import type { ActivityType } from "../lib/types";
import { money } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { useTimezone, dayKey, dayLabel, timeLabel } from "../lib/tz";
import { Icon, type IconName } from "./Icon";

/** Agrupa items (ya ordenados desc por ts) por día en la zona del usuario. */
function groupByDay<T extends { ts: string }>(
  arr: T[],
  tz: string,
  lang: "es" | "en"
): { key: string; label: string; items: T[] }[] {
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const it of arr) {
    const key = dayKey(it.ts, tz);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(it.ts, tz, lang), items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

const ACTIVITY_ICON: Record<ActivityType, IconName> = {
  group_created: "home",
  group_archived: "archive",
  group_unarchived: "archive",
  member_added: "users",
  member_joined: "users",
  member_removed: "users",
  expense_added: "plus",
  expense_edited: "edit",
  expense_deleted: "trash",
  payment_made: "card",
  marked_ready: "check",
  unmarked_ready: "clock",
  review_requested: "flag",
  recurring_added: "repeat",
  recurring_generated: "repeat",
  recurring_deleted: "trash",
  scan_used: "sparkles",
};

type Tab = "notifications" | "activity";

export function NotificationsBell() {
  const t = useT();
  const lang = useLang();
  const tz = useTimezone();
  const groups = useGroups();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("notifications");
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());

  const items = useMemo(() => buildFeed(groups), [groups]);
  const activity = useMemo(() => buildActivity(groups), [groups]);
  const unread = items.filter((n) => !seen.has(n.id)).length;

  function open_(next: boolean) {
    setOpen(next);
    if (next && items.length) {
      const s = new Set(seen);
      items.forEach((n) => s.add(n.id));
      setSeen(s);
      saveSeen(s);
    }
  }

  function notifMessage(n: FeedItem): string {
    const amt = n.amount != null ? money(n.amount, n.currency) : "";
    // Si el destinatario soy yo, muestro "MiNombre (tú)".
    const g = groups.find((x) => x.id === n.groupId);
    const toIsMe = !!g && !!n.toId && n.toId === g.meId;
    const myName = g?.members.find((m) => m.id === g.meId)?.name ?? "";
    const toDisplay = toIsMe ? `${myName} (${t("common.you")})` : n.toName ?? "?";
    if (n.type === "expense_added")
      return t("notif.expense_added", { name: n.actorName ?? "?", label: n.label ?? "", amt });
    if (n.type === "payment_made")
      return t("notif.payment_made", { name: n.actorName ?? "?", amt, to: toDisplay });
    if (n.type === "delete_requested")
      return t("notif.delete_requested", { name: n.actorName ?? "?", label: n.label ?? "" });
    if (n.type === "recurring_generated")
      return t("notif.recurring_generated", { label: n.label ?? "", amt, payer: n.toName ?? "?" });
    return t("notif.review_requested", { label: n.label ?? "" });
  }


  function activityMessage(a: ActivityItem): string {
    const name = a.mine ? t("activity.you") : a.actorName || t("activity.someone");
    const amt = a.amount != null ? money(a.amount, a.currency) : "";
    // Si el destinatario soy yo, muestro "MiNombre (tú)".
    const g = groups.find((x) => x.id === a.groupId);
    const toIsMe = !!g && !!a.toId && a.toId === g.meId;
    const myName = g?.members.find((m) => m.id === g.meId)?.name ?? "";
    const toDisplay = toIsMe ? `${myName} (${t("common.you")})` : a.toName ?? "?";
    return t(`activity.${a.type}` as any, {
      name,
      label: a.label ?? "",
      amt,
      to: toDisplay,
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => open_(true)}
        className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift"
        title={t("notif.title")}
      >
        <Icon name="bell" size={16} />
      </button>
      {/* El badge va FUERA del botón .glass (que recorta con overflow:hidden),
          si no el número se ve cortado dentro del círculo. */}
      {unread > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-[3px] rounded-full text-[10px] font-bold text-white flex items-center justify-center leading-none tabular-nums pointer-events-none"
          style={{ background: "var(--coral)", boxShadow: "0 0 0 2px var(--surface)" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col anim-up" style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}>
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

            {/* Selector Notificaciones | Actividad */}
            <div className="flex gap-1.5 mb-4">
              {(["notifications", "activity"] as Tab[]).map((tb) => {
                const on = tab === tb;
                return (
                  <button
                    key={tb}
                    onClick={() => setTab(tb)}
                    className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold text-center ${on ? "" : "glass text-muted"}`}
                    style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                  >
                    {tb === "notifications" ? t("feed.notifications") : t("feed.activity")}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto pb-10">
              {tab === "notifications" ? (
                items.length === 0 ? (
                  <div className="glass rounded-3xl p-10 text-center text-muted mt-2">{t("notif.empty")}</div>
                ) : (
                  groupByDay(items, tz, lang).map((day) => (
                    <div key={day.key} className="mb-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5 px-1">{day.label}</div>
                      <div className="space-y-1.5">
                        {day.items.map((n) => (
                          <div key={n.id} className="glass rounded-2xl flex gap-3 items-start px-4 py-3">
                            <span
                              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-muted"
                              style={{ background: "var(--glass)" }}
                            >
                              <Icon
                                name={n.type === "payment_made" ? "card" : n.type === "review_requested" ? "flag" : n.type === "delete_requested" ? "trash" : n.type === "recurring_generated" ? "repeat" : "plus"}
                                size={16}
                              />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm leading-snug">{notifMessage(n)}</div>
                              <div className="text-[11px] text-muted mt-0.5">
                                {t("notif.in", { group: n.groupName })} · {timeLabel(n.ts, tz, lang)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )
              ) : activity.length === 0 ? (
                <div className="glass rounded-3xl p-10 text-center text-muted mt-2">{t("activity.empty")}</div>
              ) : (
                groupByDay(activity, tz, lang).map((day) => (
                  <div key={day.key} className="mb-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5 px-1">{day.label}</div>
                    <div className="space-y-1.5">
                      {day.items.map((a) => (
                        <div key={a.id} className="glass rounded-2xl flex gap-3 items-start px-4 py-3">
                          <span
                            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-muted"
                            style={a.mine ? { background: "color-mix(in srgb, var(--teal) 18%, transparent)", color: "var(--teal)" } : { background: "var(--glass)" }}
                          >
                            <Icon name={ACTIVITY_ICON[a.type] ?? "bolt"} size={16} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm leading-snug">{activityMessage(a)}</div>
                            <div className="text-[11px] text-muted mt-0.5">
                              {t("notif.in", { group: a.groupName })} · {timeLabel(a.ts, tz, lang)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
