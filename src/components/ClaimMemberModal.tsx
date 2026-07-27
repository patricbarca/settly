import { initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { Overlay } from "./Overlay";

export function ClaimMemberModal({
  groupName,
  unclaimed,
  onPick,
}: {
  groupName: string;
  unclaimed: { id: string; name: string; avatar?: string }[];
  onPick: (memberId?: string) => void;
}) {
  const t = useT();
  return (
    <Overlay onClose={() => onPick(undefined)}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-bold mb-1">{t("join.whichAreYou")}</h3>
        <p className="text-sm text-muted mb-4">{t("join.whichAreYouHint", { name: groupName })}</p>

        <div className="space-y-1.5 mb-3">
          {unclaimed.map((m) => (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left hover-lift glass"
            >
              <Avatar name={m.name} avatar={m.avatar} initials={initials(m.name)} size={36} />
              <span className="text-sm font-medium flex-1 min-w-0 truncate">{m.name}</span>
              <Icon name="chevron" size={16} className="text-muted shrink-0" />
            </button>
          ))}
        </div>

        <button
          onClick={() => onPick(undefined)}
          className="glass-strong rounded-full px-4 py-2.5 w-full text-sm font-medium hover-lift"
          style={{ color: "var(--teal)" }}
        >
          {t("join.noneOfThese")}
        </button>
      </div>
    </Overlay>
  );
}
