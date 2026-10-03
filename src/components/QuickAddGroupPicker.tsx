import type { Group } from "../lib/types";
import type { QuickAdd } from "../lib/quickAdd";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** "¿A qué grupo va?" para un gasto que llega de Siri / Atajos / Wallet y tienes
 *  más de un grupo activo. Elegir abre el grupo y AddExpense recoge el gasto. */
export function QuickAddGroupPicker({
  quick,
  groups,
  onPick,
  onCancel,
}: {
  quick: QuickAdd;
  groups: Group[];
  onPick: (groupId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Overlay onClose={onCancel}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-bold mb-1">
          {quick.kind === "scan" ? t("quickAdd.scanTitle") : t("quickAdd.title")}
        </h3>
        {quick.kind === "text" && (
          <p className="text-sm mb-4 rounded-2xl glass px-3 py-2 italic">“{quick.text}”</p>
        )}
        {groups.length === 0 ? (
          <p className="text-sm text-muted mb-4">{t("quickAdd.noGroups")}</p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => onPick(g.id)}
                className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left hover-lift glass"
              >
                <span className="flex-1 min-w-0 truncate font-semibold text-sm">{g.name}</span>
                <span className="text-xs text-muted">{t("quickAdd.people", { n: String(g.members.length) })}</span>
                <span style={{ transform: "rotate(-90deg)" }} className="inline-flex text-muted">
                  <Icon name="chevron" size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
        <button onClick={onCancel} className="w-full rounded-2xl py-2.5 text-sm font-semibold glass">
          {t("quickAdd.cancel")}
        </button>
      </div>
    </Overlay>
  );
}
