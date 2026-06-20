import { useState } from "react";
import { addGroup } from "../lib/store";
import { uid } from "../lib/format";
import { useUser } from "../lib/auth";
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
  const [people, setPeople] = useState("");

  function create() {
    if (!name.trim()) return;
    const meId = uid();
    const me = { id: meId, name: user?.name || "Tú", avatar: "" };
    const others = people
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => ({ id: uid(), name: n, avatar: "" }));
    const group: Group = {
      id: uid(),
      name: name.trim(),
      currency,
      meId,
      members: [me, ...others],
      expenses: [],
    };
    addGroup(group);
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
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

          <div>
            <label className="text-xs font-semibold text-muted">
              {t("create.people")} <span className="font-normal">{t("create.peopleHint")}</span>
            </label>
            <input
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              placeholder={t("create.peoplePh")}
              className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
            />
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
