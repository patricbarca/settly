import { useState } from "react";
import type { Group, Member } from "../lib/types";
import { memberStats } from "../lib/gamification";
import { personColor, memberInitials, sortedMembers } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { ProfileModal } from "./ProfileModal";

export function Achievements({ group }: { group: Group }) {
  const t = useT();
  const [open, setOpen] = useState<Member | null>(null);

  return (
    <section className="glass rounded-3xl p-5">
      <div className="text-xs uppercase tracking-widest font-mono text-muted mb-3">{t("game.groupAch")}</div>
      <div className="space-y-1">
        {sortedMembers(group.members).map((m) => {
          const s = memberStats(group, m.id);
          return (
            <button
              key={m.id}
              onClick={() => setOpen(m)}
              className="w-full flex items-center gap-3 text-left rounded-2xl p-2 hover-lift"
            >
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: personColor(m.name) + "22" }}
              >
                {memberInitials(m)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {m.name}
                  {m.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
                </div>
                <div className="text-[11px] text-muted font-mono">
                  {t("game.level", { n: s.level })} · {s.gotCount}/{s.achievements.length}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {s.achievements.map((a) => (
                  <span key={a.id} style={{ color: a.got ? "var(--teal)" : "var(--muted)", opacity: a.got ? 1 : 0.35 }}>
                    <Icon name={a.icon} size={15} />
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {open && <ProfileModal group={group} member={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
