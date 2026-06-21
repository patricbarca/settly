import { useState } from "react";
import type { Group } from "../lib/types";
import { updateGroup } from "../lib/store";
import { computeSettle } from "../lib/split";
import { uid, personColor, initials, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { createInviteLink } from "../lib/invite";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

type AddMode = "idle" | "search" | "found" | "notfound" | "manual";

export function UsersModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [addMode, setAddMode] = useState<AddMode>("idle");
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [foundUser, setFoundUser] = useState<{ id: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteErr, setInviteErr] = useState(false);

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
      if (group.members.some((m) => m.id === data.id)) {
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
      const link = await createInviteLink(group);
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
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
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">{t("users.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Members list */}
        <div className="space-y-1 mb-4">
          {group.members.map((m) => {
            const bal = net[m.id] || 0;
            const ok = Math.abs(bal) < 0.01;
            const removable = !referenced.has(m.id) && m.id !== group.meId;
            return (
              <div key={m.id} className="flex items-center gap-3 py-2">
                <span
                  className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{ background: personColor(m.name) + "22" }}
                >
                  {initials(m.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {m.name}
                    {m.id === group.meId && <span className="text-muted text-xs ml-1">({t("members.you")})</span>}
                  </div>
                </div>
                <div
                  className="text-sm font-mono font-semibold shrink-0"
                  style={{ color: ok ? "var(--muted)" : bal > 0 ? "#0A8B5E" : "#D14444" }}
                >
                  {ok ? "—" : bal > 0 ? `+${money(bal, group.currency)}` : `−${money(-bal, group.currency)}`}
                </div>
                {removable && (
                  <button
                    onClick={() => remove(m.id)}
                    className="glass rounded-full h-7 w-7 flex items-center justify-center text-muted hover-lift lk-danger shrink-0"
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Invite link */}
        <button
          onClick={copyInvite}
          className="glass rounded-3xl px-4 py-3 w-full flex items-center gap-2 hover-lift mb-4"
          style={{ color: inviteCopied ? "#0A8B5E" : inviteErr ? "#D14444" : "var(--teal)" }}
        >
          <Icon name="copy" size={16} />
          <span className="text-sm font-medium">
            {inviteErr ? t("group.inviteError") : inviteCopied ? t("group.copied") : t("group.shareBtn")}
          </span>
        </button>

        {/* Add member */}
        {addMode === "idle" && (
          <button
            onClick={() => setAddMode("search")}
            className="glass-strong rounded-3xl px-4 py-3 w-full flex items-center gap-2 hover-lift"
            style={{ color: "var(--teal)" }}
          >
            <Icon name="plus" size={16} />
            <span className="text-sm font-semibold">{t("members.add")}</span>
          </button>
        )}

        {addMode !== "idle" && (
          <div className="glass rounded-3xl p-4 anim-up">
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
                  <button onClick={() => setAddMode("manual")} className="lk text-xs">{t("members.addManual")}</button>
                  <span className="text-muted text-xs">·</span>
                  <button onClick={reset} className="lk text-xs text-muted">{t("common.cancel")}</button>
                </div>
              </>
            )}
            {addMode === "found" && foundUser && (
              <>
                <p className="text-sm font-medium mb-3">{t("members.found", { name: foundUser.name })}</p>
                <div className="flex gap-2">
                  <button onClick={addFoundUser} className="glass-strong rounded-full px-4 py-2 text-sm font-medium hover-lift" style={{ color: "var(--teal)" }}>
                    {t("members.addConfirm")}
                  </button>
                  <button onClick={reset} className="glass rounded-full px-4 py-2 text-sm text-muted hover-lift">{t("common.cancel")}</button>
                </div>
              </>
            )}
            {addMode === "notfound" && (
              <>
                <p className="text-sm text-muted mb-3">{t("members.notFound")}</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setAddMode("manual")} className="glass rounded-full px-4 py-2 text-sm text-muted hover-lift">{t("members.addManual")}</button>
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
                <button onClick={() => setAddMode("search")} className="lk text-xs mt-2 text-muted">{t("members.backSearch")}</button>
              </>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
