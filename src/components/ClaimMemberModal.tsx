import { useState } from "react";
import { initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { Overlay } from "./Overlay";

/** Picker "¿cuál de estos eres tú?" al unirse por link cuando quedan miembros
 *  sin reclamar. BLINDADO: no se cierra al tocar fuera y "ninguno" pide
 *  confirmación — saltárselo creaba un miembro DUPLICADO junto al placeholder
 *  (caso real "Aussie fam 2026": alguien entró y salió 12s después al verse
 *  duplicado). Elegir mal aquí es caro; confirmar es barato. */
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
  const [confirmNone, setConfirmNone] = useState(false);

  return (
    /* onClose vacío a propósito: tocar fuera NO debe descartar la elección. */
    <Overlay onClose={() => {}}>
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

        {confirmNone ? (
          <div
            className="rounded-2xl p-3.5"
            style={{ background: "rgba(232,146,12,0.12)", border: "1px solid rgba(232,146,12,0.3)" }}
          >
            <div className="text-sm font-semibold mb-1">{t("join.noneConfirmTitle")}</div>
            <p className="text-xs text-muted leading-snug mb-3">{t("join.noneConfirmBody")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmNone(false)}
                className="glass rounded-full px-4 py-2 text-sm font-medium hover-lift flex-1"
              >
                {t("join.noneConfirmBack")}
              </button>
              <button
                onClick={() => onPick(undefined)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white hover-lift flex-1"
                style={{ background: "var(--amber)" }}
              >
                {t("join.noneConfirmCta")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmNone(true)}
            className="glass-strong rounded-full px-4 py-2.5 w-full text-sm font-medium hover-lift"
            style={{ color: "var(--teal)" }}
          >
            {t("join.noneOfThese")}
          </button>
        )}
      </div>
    </Overlay>
  );
}
