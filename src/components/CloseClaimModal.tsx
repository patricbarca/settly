import { useState } from "react";
import type { Expense, Group } from "../lib/types";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";
import { useT } from "../lib/i18n";
import { closeClaimRound } from "../lib/store";
import { makeActivity } from "../lib/activity";
import type { ClosePolicy } from "../lib/claims";

/** Cierre de la ronda de asignación: congela el reparto y decide qué pasa con
 *  los ítems que nadie marcó (el caso que hunde la feature si no se decide). */
export function CloseClaimModal({
  group,
  expense,
  onClose,
}: {
  group: Group;
  expense: Expense;
  onClose: () => void;
}) {
  const t = useT();
  const unclaimed = (expense.items ?? []).filter((it) => !(it.participantIds ?? []).length).length;
  const [policy, setPolicy] = useState<ClosePolicy>("all");

  const options: { id: ClosePolicy; label: string }[] = [
    { id: "all", label: t("claim.policyAll") },
    { id: "responders", label: t("claim.policyResponders") },
    { id: "keep", label: t("claim.policyKeep") },
  ];

  function confirm() {
    closeClaimRound(group.id, expense.id, unclaimed > 0 ? policy : "keep", {
      activity: makeActivity({
        type: "claim_closed",
        actorId: group.meId,
        actorName: group.members.find((m) => m.id === group.meId)?.name ?? "?",
        label: expense.label,
      }),
    });
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-5 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display font-bold text-lg mb-2">{t("claim.closeTitle")}</h2>
        <p className="text-sm text-muted mb-4">
          {unclaimed > 0 ? t("claim.closeBody", { n: unclaimed }) : t("claim.closeAllClaimed")}
        </p>

        {unclaimed > 0 && (
          <div className="space-y-2 mb-4">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => setPolicy(o.id)}
                className="w-full glass rounded-2xl px-3 py-2.5 flex items-center gap-2.5 text-left text-sm"
                style={policy === o.id ? { border: "1px solid var(--teal)" } : undefined}
              >
                <span
                  className="rounded-full h-5 w-5 flex items-center justify-center shrink-0"
                  style={{
                    background: policy === o.id ? "var(--teal)" : "transparent",
                    border: policy === o.id ? "none" : "1px solid var(--line)",
                    color: "#fff",
                  }}
                >
                  {policy === o.id && <Icon name="check" size={12} />}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 glass rounded-2xl py-2.5 text-sm font-semibold">
            {t("common.cancel")}
          </button>
          <button
            onClick={confirm}
            className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--teal), var(--indigo))" }}
          >
            {t("claim.close")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
