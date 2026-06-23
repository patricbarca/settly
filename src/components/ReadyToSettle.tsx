import type { Group, Member } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withActivity } from "../lib/activity";
import { personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

export function ReadyToSettle({ group }: { group: Group }) {
  const t = useT();
  const ready = group.ready ?? [];
  const meReady = ready.includes(group.meId);
  const allReady = group.members.length > 0 && group.members.every((m) => ready.includes(m.id));

  function toggleMe() {
    updateGroup(group.id, (g) => {
      const r = g.ready ?? [];
      const wasReady = r.includes(g.meId);
      return {
        ...g,
        ready: wasReady ? r.filter((x) => x !== g.meId) : [...r, g.meId],
        activity: withActivity(g, {
          type: wasReady ? "unmarked_ready" : "marked_ready",
          actorId: g.meId,
          actorName: g.members.find((m) => m.id === g.meId)?.name,
        }),
      };
    });
  }
  function remind(m: Member) {
    // DEMO: aviso local. El push/email real necesita backend (Supabase + notificaciones).
    alert(t("ready.reminded", { name: m.name }));
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("ready.title")}</div>
      <p className="text-sm text-muted mt-0.5 mb-3">{t("ready.sub")}</p>

      <div className="space-y-1.5">
        {group.members.map((m) => {
          const isReady = ready.includes(m.id);
          return (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span
                className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                style={{ background: personColor(m.name) + "22" }}
              >
                {memberInitials(m)}
              </span>
              <span className="truncate">
                {m.name}
                {m.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
              </span>
              {isReady ? (
                <span className="ml-auto text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#0A8B5E" }}>
                  <Icon name="check" size={14} /> {t("ready.done")}
                </span>
              ) : (
                <button
                  onClick={() => remind(m)}
                  className="ml-auto glass rounded-full px-3 py-1 text-xs hover-lift text-muted"
                >
                  {t("ready.remind")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={toggleMe}
        className="rounded-full px-4 py-2 text-sm font-semibold text-white hover-lift mt-3"
        style={{ background: meReady ? "var(--muted)" : "var(--teal)" }}
      >
        {meReady ? t("ready.undo") : t("ready.mark")}
      </button>

      {allReady && (
        <div
          className="mt-3 rounded-3xl p-3 text-sm font-semibold text-center"
          style={{ background: "rgba(10,139,94,0.12)", color: "#0A8B5E" }}
        >
          {t("ready.allReady")}
        </div>
      )}
    </section>
  );
}
