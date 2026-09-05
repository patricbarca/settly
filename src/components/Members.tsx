import { useState } from "react";
import type { Group, Member } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withActivity } from "../lib/activity";
import { computeSettle } from "../lib/split";
import { useUser } from "../lib/auth";
import { memberInitials, sortedMembers, displayName } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { ProfileModal } from "./ProfileModal";

export function Members({ group }: { group: Group }) {
  const user = useUser();
  const isOwner = !group.ownerId || group.ownerId === user?.id;
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

  // Solo el DUEÑO del grupo puede quitar miembros. Antes cualquiera podía
  // eliminar a cualquiera —incluido el propio dueño—, dejándole sin acceso.
  function remove(id: string) {
    if (!isOwner || referenced.has(id) || id === group.meId) return;
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
    <div className="glass rounded-3xl p-3">
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted px-1 mb-2">
        {t("members.title")} · {group.members.length}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {sortedMembers(group.members).map((m) => {
          const removable = isOwner && !referenced.has(m.id) && m.id !== group.meId;
          const paid = Math.abs(net[m.id] || 0) < 0.01;
          return (
            <div key={m.id} className="rounded-full pl-1 pr-2.5 py-1 flex items-center gap-1.5 text-sm shrink-0" style={{ background: "var(--surface-soft)" }}>
              <button onClick={() => setProfile(m)} className="flex items-center gap-1.5 min-w-0" title={m.name}>
                <span
                  className="rounded-full shrink-0"
                  title={paid ? "Al día" : "Pendiente"}
                  style={{ boxShadow: `0 0 0 2px ${paid ? "#0A8B5E" : "#E0A400"}` }}
                >
                  <Avatar name={m.name} avatar={m.avatar} initials={memberInitials(m)} size={28} />
                </span>
                <span className="font-medium truncate max-w-[8rem]">
                  {displayName(m)}
                  {m.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
                </span>
              </button>
              {removable && (
                <button onClick={() => remove(m.id)} className="lk lk-danger ml-0.5 flex items-center shrink-0">
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
