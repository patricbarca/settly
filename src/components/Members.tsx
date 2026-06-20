import { useState } from "react";
import type { Group, Member } from "../lib/types";
import { updateGroup } from "../lib/store";
import { computeSettle } from "../lib/split";
import { uid, personColor, initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { createInviteLink } from "../lib/invite";
import { Icon } from "./Icon";
import { ProfileModal } from "./ProfileModal";

type AddMode = "idle" | "search" | "found" | "notfound" | "manual";

export function Members({ group }: { group: Group }) {
  const t = useT();
  const [addMode, setAddMode] = useState<AddMode>("idle");
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [foundUser, setFoundUser] = useState<{ id: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteErr, setInviteErr] = useState(false);
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

  function reset() {
    setAddMode("idle");
    setQuery("");
    setManualName("");
    setFoundUser(null);
    setSearching(false);
  }

  async function searchUser() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setFoundUser(null);

    const isPhone = q.startsWith("+") || /^\+?\d[\d\s\-().]{6,}$/.test(q);
    const { data } = await supabase
      .from("profiles")
      .select("id, name, phone")
      .eq(isPhone ? "phone" : "email", q)
      .maybeSingle();

    setSearching(false);
    if (data) {
      const alreadyIn = group.members.some(
        (m) => m.id === data.id
      );
      if (alreadyIn) {
        setFoundUser(null);
        setAddMode("notfound");
      } else {
        setFoundUser(data);
        setAddMode("found");
      }
    } else {
      setAddMode("notfound");
    }
  }

  async function addFoundUser() {
    if (!foundUser) return;
    const memberId = uid();
    updateGroup(group.id, (g) => ({
      ...g,
      members: [...g.members, { id: memberId, name: foundUser.name, avatar: "" }],
    }));
    // Link their Supabase UUID to this member slot
    await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: foundUser.id,
      member_id: memberId,
    });
    reset();
  }

  function addManual() {
    const n = manualName.trim();
    if (!n) return;
    updateGroup(group.id, (g) => ({
      ...g,
      members: [...g.members, { id: uid(), name: n, avatar: "" }],
    }));
    reset();
  }

  async function copyInvite() {
    setInviteErr(false);
    try {
      const link = await createInviteLink(group.id);
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => { setInviteCopied(false); reset(); }, 2500);
    } catch {
      setInviteErr(true);
      setTimeout(() => setInviteErr(false), 2500);
    }
  }

  function remove(id: string) {
    if (referenced.has(id) || id === group.meId) return;
    updateGroup(group.id, (g) => ({ ...g, members: g.members.filter((m) => m.id !== id) }));
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
                  {initials(m.name)}
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

        {addMode === "idle" && (
          <button
            onClick={() => setAddMode("search")}
            className="glass rounded-full px-3 py-1.5 text-sm hover-lift text-muted inline-flex items-center gap-1 shrink-0"
          >
            <Icon name="plus" size={14} /> {t("members.add")}
          </button>
        )}
      </div>

      {/* Add member panel */}
      {addMode !== "idle" && (
        <div className="glass rounded-2xl p-4 mt-3 anim-up">
          {addMode === "search" && (
            <>
              <p className="text-xs text-muted mb-2">{t("members.searchHint")}</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUser()}
                  placeholder={t("members.searchPh")}
                  className="glass rounded-xl px-3 py-2 text-sm flex-1"
                />
                <button
                  onClick={searchUser}
                  disabled={!query.trim() || searching}
                  className="glass-strong rounded-xl px-3 py-2 text-sm font-medium hover-lift disabled:opacity-50"
                >
                  {searching ? "..." : t("members.search")}
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setAddMode("manual")} className="lk text-xs">
                  {t("members.addManual")}
                </button>
                <span className="text-muted text-xs">·</span>
                <button onClick={reset} className="lk text-xs text-muted">{t("common.cancel")}</button>
              </div>
            </>
          )}

          {addMode === "found" && foundUser && (
            <>
              <p className="text-sm font-medium mb-3">
                {t("members.found", { name: foundUser.name })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={addFoundUser}
                  className="glass-strong rounded-full px-4 py-2 text-sm font-medium hover-lift"
                  style={{ color: "var(--teal)" }}
                >
                  {t("members.addConfirm")}
                </button>
                <button onClick={reset} className="glass rounded-full px-4 py-2 text-sm text-muted hover-lift">
                  {t("common.cancel")}
                </button>
              </div>
            </>
          )}

          {addMode === "notfound" && (
            <>
              <p className="text-sm text-muted mb-3">{t("members.notFound")}</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={copyInvite}
                  className="glass-strong rounded-full px-4 py-2 text-sm font-medium hover-lift inline-flex items-center gap-1.5"
                  style={inviteCopied ? { color: "#0A8B5E" } : inviteErr ? { color: "#D14444" } : { color: "var(--teal)" }}
                >
                  <Icon name="copy" size={14} />
                  {inviteErr ? t("group.inviteError") : inviteCopied ? t("group.copied") : t("group.invite")}
                </button>
                <button onClick={() => setAddMode("manual")} className="glass rounded-full px-4 py-2 text-sm text-muted hover-lift">
                  {t("members.addManual")}
                </button>
                <button onClick={reset} className="lk text-sm text-muted">{t("common.cancel")}</button>
              </div>
            </>
          )}

          {addMode === "manual" && (
            <>
              <p className="text-xs text-muted mb-2">{t("members.manualHint")}</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManual()}
                  placeholder={t("members.name")}
                  className="glass rounded-xl px-3 py-2 text-sm flex-1"
                />
                <button
                  onClick={addManual}
                  disabled={!manualName.trim()}
                  className="glass-strong rounded-xl px-3 py-2 text-sm font-medium hover-lift disabled:opacity-50"
                  style={{ color: "var(--teal)" }}
                >
                  <Icon name="check" size={16} />
                </button>
              </div>
              <button onClick={() => setAddMode("search")} className="lk text-xs mt-2 text-muted">
                {t("members.backSearch")}
              </button>
            </>
          )}
        </div>
      )}

      {profile && <ProfileModal group={group} member={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}
