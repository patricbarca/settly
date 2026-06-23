import { useState } from "react";
import type { Group, Member } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withActivity } from "../lib/activity";
import { computeSettle } from "../lib/split";
import { personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { ProfileModal } from "./ProfileModal";

export function Members({ group }: { group: Group }) {
  const t = useT();
  const [profile, setProfile] = useState<Member | null>(null);

  const referenced = new Set<string>();
  group.expenses.forEach((e) => {
    referenced.add(e.payerId);
    e.participantIds.forEach((p) => referenced.add(p));
  });
  (group.settlements ?? []).forEach((s) => {
    referenced.add(s.from);
    referenced.add(s.to);
  });

  const { net } = computeSettle(group.members, group.expenses, group.settlements ?? []);

  function remove(id: string) {
    if (referenced.has(id) || id === group.meId) return;
    const removed = group.members.find((m) => m.id === id)?.name;
    updateGroup(group.id, (g) => ({
      ...g,
      members: g.members.filter((m) => m.id !== id),
      activity: withActivity(g, {
        type: "member_removed",
        actorId: g.meId,
        actorName: g.members.find((m) => m.id === g.meId)?.name,
        label: removed,
      }),
    }));
  }

  return (
    <div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {group.members.map((m) => {
          const removable = !referenced.has(m.id) && m.id !== group.meId;
          const paid = Math.abs(net[m.id] || 0) < 0.01;
          return (
            <div key={m.id} className="glass rounded-full pl-1 pr-2.5 py-1 flex items-center gap-1.5 text-sm shrink-0">
              <button onClick={() => setProfile(m)} className="flex items-center gap-1.5">
                <span
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                  title={paid ? "Al día" : "Pendiente"}
                  style={{ background: personColor(m.name) + "22", boxShadow: `0 0 0 2px ${paid ? "#0A8B5E" : "#E0A400"}` }}
                >
                  {memberInitials(m)}
                </span>
                <span className="font-medium">
                  {m.name}
                  {m.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
                </span>
              </button>
              {removable && (
                <button onClick={() => remove(m.id)} className="lk lk-danger ml-0.5 flex items-center">
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {profile && <ProfileModal group={group} member={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}
