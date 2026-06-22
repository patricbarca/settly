import { useState } from "react";
import type { Group, PayType, PayMethod } from "../lib/types";
import { updateGroup } from "../lib/store";
import { PAY_TYPES, memberPays } from "../lib/pay";
import { personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function PayMethodModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  // Tipo seleccionado por miembro (para editar cada método por separado).
  const [sel, setSel] = useState<Record<string, PayType>>(() => {
    const m: Record<string, PayType> = {};
    for (const mem of group.members) m[mem.id] = memberPays(mem)[0]?.type ?? "payid";
    return m;
  });

  function valOf(mid: string, type: PayType): { value: string; value2?: string } {
    const mem = group.members.find((x) => x.id === mid);
    const found = memberPays(mem).find((p) => p.type === type);
    return { value: found?.value ?? "", value2: found?.value2 };
  }

  function setMethod(mid: string, type: PayType, patch: { value?: string; value2?: string }) {
    updateGroup(group.id, (g) => ({
      ...g,
      members: g.members.map((m) => {
        if (m.id !== mid) return m;
        const list = memberPays(m).slice();
        const i = list.findIndex((p) => p.type === type);
        const base: PayMethod = i >= 0 ? list[i] : { type, value: "" };
        const next: PayMethod = { ...base, type, ...patch };
        if (i >= 0) list[i] = next;
        else list.push(next);
        const cleaned = list.filter((p) => p.value.trim());
        return { ...m, pays: cleaned, pay: cleaned[0] };
      }),
    }));
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-md p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-2xl font-bold">{t("pay.methods")}</h2>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="text-sm text-muted mb-4">{t("pay.methodsHint")}</p>

        <div className="space-y-3">
          {group.members.map((m) => {
            const type = sel[m.id] ?? "payid";
            const v = valOf(m.id, type);
            const has = (pt: PayType) => memberPays(m).some((p) => p.type === pt);
            return (
              <div key={m.id} className="glass rounded-3xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                    style={{ background: personColor(m.name) + "22" }}
                  >
                    {memberInitials(m)}
                  </span>
                  <span className="font-semibold text-sm">{m.name}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {PAY_TYPES.map((pt) => {
                    const on = type === pt;
                    return (
                      <button
                        key={pt}
                        onClick={() => setSel((s) => ({ ...s, [m.id]: pt }))}
                        className={`rounded-full px-2.5 py-1 text-xs inline-flex items-center gap-1 ${on ? "" : "glass text-muted"}`}
                        style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                      >
                        {has(pt) && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: on ? "var(--pill-fg)" : "var(--teal)" }}
                          />
                        )}
                        {t(`pay.label.${pt}`)}
                      </button>
                    );
                  })}
                </div>
                {type === "bank" ? (
                  <div className="flex gap-2">
                    <input
                      value={v.value}
                      onChange={(e) => setMethod(m.id, "bank", { value: e.target.value })}
                      placeholder={t("pay.bank.bsb")}
                      className="glass rounded-xl px-3 py-2 text-sm w-24 font-mono"
                    />
                    <input
                      value={v.value2 ?? ""}
                      onChange={(e) => setMethod(m.id, "bank", { value2: e.target.value })}
                      placeholder={t("pay.bank.account")}
                      className="glass rounded-xl px-3 py-2 text-sm flex-1 font-mono"
                    />
                  </div>
                ) : (
                  <input
                    value={v.value}
                    onChange={(e) => setMethod(m.id, type, { value: e.target.value })}
                    placeholder={t(`pay.ph.${type}`)}
                    className="glass rounded-xl px-3 py-2 text-sm w-full"
                  />
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift mt-4 w-full">
          {t("common.save")}
        </button>
      </div>
    </Overlay>
  );
}
