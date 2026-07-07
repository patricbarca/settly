import { useState, useEffect } from "react";
import { addGroup } from "../lib/store";
import { makeActivity } from "../lib/activity";
import { uid, personColor, initials } from "../lib/format";
import { useUser } from "../lib/auth";
import { getNetwork, type Contact } from "../lib/contacts";
import { useHiddenContacts } from "../lib/hiddenContacts";
import { useT, useLang } from "../lib/i18n";
import { CURRENCIES, localCurrencyName } from "../lib/currencies";
import type { Group, GroupKind } from "../lib/types";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "es" ? "es-ES" : "en-US";
  const user = useUser();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [kind, setKind] = useState<GroupKind>("trip");
  const [network, setNetwork] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [manualMembers, setManualMembers] = useState<{ id: string; name: string }[]>([]);
  const [manualName, setManualName] = useState("");

  useEffect(() => {
    getNetwork().then(setNetwork).catch(() => {});
  }, []);

  // Personas sugeridas: tu red menos los contactos ocultos, filtradas por la
  // búsqueda (por nombre o email).
  const { hidden } = useHiddenContacts();
  const q = query.trim().toLowerCase();
  const filtered = network
    .filter((c) => !hidden.has(c.userId))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addManual() {
    const n = manualName.trim();
    if (!n) return;
    setManualMembers((prev) => [...prev, { id: uid(), name: n }]);
    setManualName("");
  }

  function removeManual(id: string) {
    setManualMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function create() {
    if (!name.trim()) return;
    const meId = uid();
    const me = { id: meId, name: user?.name || "Tú", avatar: user?.avatar || "" };
    const chosen = network.filter((c) => selected.has(c.userId));
    const extraMembers: { userId: string; memberId: string }[] = [];
    const others = chosen.map((c) => {
      const memberId = uid();
      extraMembers.push({ userId: c.userId, memberId });
      return { id: memberId, name: c.name, avatar: c.avatar };
    });
    const manual = manualMembers.map((m) => ({ id: m.id, name: m.name, avatar: "", claimed: false }));
    const group: Group = {
      id: uid(),
      name: name.trim(),
      currency,
      kind,
      meId,
      members: [me, ...others, ...manual],
      expenses: [],
      activity: [makeActivity({ type: "group_created", actorId: meId, actorName: me.name })],
    };
    addGroup(group, extraMembers);
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-md p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold">{t("create.title")}</h2>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted">{t("members.name")}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder={t("create.namePh")}
              className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted">{t("create.kind")}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(["trip", "home"] as GroupKind[]).map((k) => {
                const on = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`rounded-2xl p-3 text-left hover-lift ${on ? "" : "glass"}`}
                    style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <Icon name={k === "home" ? "home" : "plane"} size={15} />
                      {t(k === "home" ? "create.kindHome" : "create.kindTrip")}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ opacity: 0.7 }}>
                      {t(k === "home" ? "create.kindHomeDesc" : "create.kindTripDesc")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted">{t("create.currency")}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {localCurrencyName(c.code, locale)}
                </option>
              ))}
            </select>
          </div>

          {/* Personas de tu red (solo usuarios registrados). Si no tienes red no
              se muestra nada: a otros los invitas con un link tras crear el grupo. */}
          {network.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted">{t("create.people")}</label>
                {selected.size > 0 && (
                  <span className="text-[11px] text-muted">{t("create.peopleSelected", { n: selected.size })}</span>
                )}
              </div>

              {/* Buscador de personas sugeridas */}
              <div className="relative mt-1">
                <Icon
                  name="search"
                  size={15}
                  className="text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("create.searchPeople")}
                  className="glass rounded-xl pl-9 pr-8 py-2.5 text-sm w-full"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover-lift"
                    title={t("common.cancel")}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="text-xs text-muted text-center py-4">{t("create.noMatches")}</div>
              ) : (
              <div className="glass rounded-2xl p-1.5 mt-1.5 max-h-52 overflow-y-auto space-y-1">
                {filtered.map((c) => {
                  const on = selected.has(c.userId);
                  return (
                    <button
                      key={c.userId}
                      onClick={() => toggle(c.userId)}
                      className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover-lift"
                      style={on ? { background: "var(--surface-soft)" } : undefined}
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
                      <span
                        className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: on ? "var(--teal)" : "transparent",
                          border: on ? "none" : "1.5px solid var(--line)",
                          color: "#fff",
                        }}
                      >
                        {on && <Icon name="check" size={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* Alta manual: gente sin cuenta todavía. Luego puedes mandarles un
              link para que vinculen su cuenta a esta persona (UsersModal). */}
          <div>
            <label className="text-xs font-semibold text-muted">{t("members.addManual")}</label>
            {manualMembers.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {manualMembers.map((m) => (
                  <span key={m.id} className="glass rounded-full pl-3 pr-1.5 py-1 text-sm flex items-center gap-1.5">
                    {m.name}
                    <button onClick={() => removeManual(m.id)} className="text-muted hover-lift">
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-1.5">
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addManual())}
                placeholder={t("members.name")}
                className="glass rounded-xl px-3 py-2 text-sm flex-1"
              />
              <button
                onClick={addManual}
                disabled={!manualName.trim()}
                className="glass-strong rounded-xl px-3 py-2 text-sm font-medium hover-lift disabled:opacity-50"
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
            <p className="text-[11px] text-muted mt-1">{t("members.manualHint")}</p>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={create}
            disabled={!name.trim()}
            className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-50"
          >
            {t("home.createGroup")}
          </button>
          <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
