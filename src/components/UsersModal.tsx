import { useState, useEffect } from "react";
import type { Group } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withActivity } from "../lib/activity";
import { computeSettle } from "../lib/split";
import { uid, personColor, initials, memberInitials, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { getNetwork, type Contact } from "../lib/contacts";
import { createInviteLink } from "../lib/invite";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

// Solo se pueden añadir usuarios YA registrados (búsqueda por email/teléfono) o
// invitar por link. No hay alta "manual" de personas sin cuenta.
type AddMode = "idle" | "search" | "found" | "notfound";

export function UsersModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const [addMode, setAddMode] = useState<AddMode>("idle");
  const [query, setQuery] = useState("");
  const [foundUser, setFoundUser] = useState<{ id: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteErr, setInviteErr] = useState(false);
  // Sugeridos: tu red (registrados) menos quienes ya están en este grupo.
  const [network, setNetwork] = useState<Contact[]>([]);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getNetwork().then(setNetwork).catch(() => {});
    supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", group.id)
      .then(({ data }) => setExistingIds(new Set((data ?? []).map((r) => r.user_id))));
  }, [group.id]);

  const q = query.trim().toLowerCase();
  const suggestions = network
    .filter((c) => !existingIds.has(c.userId))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));

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
      if (existingIds.has(data.id)) {
        setAddMode("notfound");
      } else {
        setFoundUser(data);
        setAddMode("found");
      }
    } else {
      setAddMode("notfound");
    }
  }

  async function addUser(userId: string, name: string, avatar = "") {
    const memberId = uid();
    updateGroup(group.id, (g) => ({
      ...g,
      members: [...g.members, { id: memberId, name, avatar }],
      activity: withActivity(g, {
        type: "member_added",
        actorId: g.meId,
        actorName: g.members.find((m) => m.id === g.meId)?.name,
        label: name,
      }),
    }));
    setExistingIds((prev) => new Set(prev).add(userId)); // que desaparezca de sugeridos
    await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: userId,
      member_id: memberId,
    });
    reset();
  }

  async function addFoundUser() {
    if (!foundUser) return;
    await addUser(foundUser.id, foundUser.name);
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
                  {memberInitials(m)}
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
                  <button onClick={reset} className="lk text-xs text-muted">{t("common.cancel")}</button>
                </div>

                {/* Sugeridos: tu red (registrados) que aún no están en el grupo,
                    ordenados por grupo activo más reciente. Click = añadir. */}
                {suggestions.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">
                      {t("members.suggested")}
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-1">
                      {suggestions.map((c) => (
                        <button
                          key={c.userId}
                          onClick={() => addUser(c.userId, c.name, c.avatar)}
                          className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover-lift"
                        >
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <span
                              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: personColor(c.name) + "22" }}
                            >
                              {initials(c.name)}
                            </span>
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="text-sm block truncate">{c.name}</span>
                            {c.email && <span className="text-[11px] text-muted block truncate">{c.email}</span>}
                          </span>
                          <Icon name="plus" size={16} className="text-muted shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                <p className="text-sm text-muted mb-3">{t("members.notFoundInvite")}</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { reset(); copyInvite(); }} className="glass-strong rounded-full px-4 py-2 text-sm font-medium hover-lift" style={{ color: "var(--teal)" }}>
                    <span className="inline-flex items-center gap-1.5"><Icon name="copy" size={14} /> {t("group.shareBtn")}</span>
                  </button>
                  <button onClick={() => setAddMode("search")} className="glass rounded-full px-4 py-2 text-sm text-muted hover-lift">{t("members.backSearch")}</button>
                  <button onClick={reset} className="lk text-sm text-muted">{t("common.cancel")}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
