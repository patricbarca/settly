import type { Group, PayType } from "../lib/types";
import { updateGroup } from "../lib/store";
import { PAY_TYPES } from "../lib/pay";
import { personColor, initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function PayMethodModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();

  function setType(mid: string, type: PayType) {
    updateGroup(group.id, (g) => ({
      ...g,
      members: g.members.map((m) => (m.id === mid ? { ...m, pay: { type, value: m.pay?.value ?? "" } } : m)),
    }));
  }
  function setValue(mid: string, value: string) {
    updateGroup(group.id, (g) => ({
      ...g,
      members: g.members.map((m) => (m.id === mid ? { ...m, pay: { type: m.pay?.type ?? "payid", value } } : m)),
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
            const type = m.pay?.type ?? "payid";
            return (
              <div key={m.id} className="glass rounded-3xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                    style={{ background: personColor(m.name) + "22" }}
                  >
                    {initials(m.name)}
                  </span>
                  <span className="font-semibold text-sm">{m.name}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {PAY_TYPES.map((pt) => {
                    const on = type === pt;
                    return (
                      <button
                        key={pt}
                        onClick={() => setType(m.id, pt)}
                        className={`rounded-full px-2.5 py-1 text-xs ${on ? "" : "glass text-muted"}`}
                        style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                      >
                        {t(`pay.label.${pt}`)}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={m.pay?.value ?? ""}
                  onChange={(e) => setValue(m.id, e.target.value)}
                  placeholder={t(`pay.ph.${type}`)}
                  className="glass rounded-xl px-3 py-2 text-sm w-full"
                />
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
