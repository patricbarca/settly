import type { Group, Member } from "../lib/types";
import { memberStats } from "../lib/gamification";
import { money, personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { SettleRing } from "./SettleRing";

export function ProfileModal({
  group,
  member,
  onClose,
}: {
  group: Group;
  member: Member;
  onClose: () => void;
}) {
  const t = useT();
  const s = memberStats(group, member.id);
  const ok = Math.abs(s.net) < 0.01;

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span
              className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold"
              style={{ background: personColor(member.name) + "22" }}
            >
              {memberInitials(member)}
            </span>
            <div>
              <div className="font-display text-xl font-bold">
                {member.name}
                {member.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
              </div>
              <div className="text-xs text-muted font-mono">
                {t("game.level", { n: s.level })} · {s.xp} XP
              </div>
            </div>
          </div>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 glass rounded-3xl p-3 mb-3">
          <SettleRing value={s.score} size={48} stroke={6} color="#0FA3A3" track="var(--line)" />
          <div className="text-sm">
            <div className="text-muted text-xs">{t("home.yourBalance")}</div>
            <div
              className="font-mono font-bold"
              style={{ color: ok ? "var(--muted)" : s.net > 0 ? "#0A8B5E" : "#D14444" }}
            >
              {ok ? t("bal.uptodate") : s.net > 0 ? `+${money(s.net, group.currency)}` : `−${money(-s.net, group.currency)}`}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-muted text-xs">{t("game.title")}</div>
            <div className="font-mono font-bold">
              {s.gotCount}/{s.achievements.length}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {s.achievements.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl p-3 text-center ${a.got ? "glass" : ""}`}
              style={a.got ? undefined : { background: "var(--surface-soft)", opacity: 0.5 }}
            >
              <div className="flex justify-center mb-1.5" style={{ color: a.got ? "var(--teal)" : "var(--muted)" }}>
                <Icon name={a.icon} size={22} />
              </div>
              <div className="text-[11px] font-semibold leading-tight">{t(`ach.${a.id}.t`)}</div>
              <div className="text-[10px] text-muted mt-0.5 leading-tight">{t(`ach.${a.id}.d`)}</div>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
