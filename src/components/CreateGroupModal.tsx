import { useState, useEffect } from "react";
import { addGroup } from "../lib/store";
import { uid, personColor, initials } from "../lib/format";
import { useUser } from "../lib/auth";
import { getNetwork, type Contact } from "../lib/contacts";
import { useT, useLang } from "../lib/i18n";
import { CURRENCIES, localCurrencyName } from "../lib/currencies";
import type { Group } from "../lib/types";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "es" ? "es-ES" : "en-US";
  const user = useUser();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [network, setNetwork] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    getNetwork().then(setNetwork).catch(() => {});
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    const group: Group = {
      id: uid(),
      name: name.trim(),
      currency,
      meId,
      members: [me, ...others],
      expenses: [],
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
              <label className="text-xs font-semibold text-muted">{t("create.people")}</label>
              <div className="glass rounded-2xl p-1.5 mt-1 max-h-52 overflow-y-auto space-y-1">
                {network.map((c) => {
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
                      <span className="text-sm flex-1 truncate">{c.name}</span>
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
            </div>
          )}
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
