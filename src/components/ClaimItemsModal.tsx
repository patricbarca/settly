import { useEffect, useMemo, useState } from "react";
import type { Expense, Group } from "../lib/types";
import { Overlay } from "./Overlay";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { useT } from "../lib/i18n";
import { money } from "../lib/format";
import { claimExpenseItems } from "../lib/store";
import { makeActivity } from "../lib/activity";
import { itemizedSplits, canClaimForOthers } from "../lib/claims";
import { useUser } from "../lib/auth";

/** "¿Qué consumiste?" — cada persona marca sus propios ítems de un gasto con
 *  una ronda de asignación abierta. Solo toca MI pertenencia: el RPC atómico
 *  del store hace el resto sin pisar lo que marcaron los demás. */
export function ClaimItemsModal({
  group,
  expense,
  onClose,
}: {
  group: Group;
  expense: Expense;
  onClose: () => void;
}) {
  const t = useT();
  const user = useUser();
  const meId = group.meId;
  const items = expense.items ?? [];
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  // El dueño del grupo, quien abrió la ronda y quien puso el gasto pueden
  // marcar por los demás (en la mesa es normal que uno solo tenga el móvil
  // con el ticket). El resto solo por sí mismo. Espejo del guard del RPC.
  const canPickForOthers = canClaimForOthers(expense, group, user?.id);
  const expected = expense.claimRound?.expected ?? [];
  const targets = canPickForOthers
    ? [meId, ...expected.filter((id) => id !== meId)]
    : [meId];
  const [targetId, setTargetId] = useState(meId);
  const target = targets.includes(targetId) ? targetId : meId;
  const isMe = target === meId;
  const doneIds = expense.claimRound?.done ?? [];

  const picksOf = (id: string) =>
    new Set(items.map((it, i) => (it.participantIds?.includes(id) ? i : -1)).filter((i) => i >= 0));

  const [picked, setPicked] = useState<Set<number>>(() => picksOf(meId));

  // Al cambiar de persona, cargar SU selección actual (no arrastrar la mía).
  useEffect(() => {
    setPicked(picksOf(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Paso 2: confirmar antes de marcarse como listo. Sin esto, un toque de más
  // en "Listo" deja a la persona registrada con un reparto a medias y los
  // demás la ven como "ya eligió" — justo el error caro de esta pantalla.
  const [confirming, setConfirming] = useState(false);

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Mi parte en vivo, con mi selección actual aplicada sobre lo que ya hay.
  const myShare = useMemo(() => {
    const next = items.map((it, i) => {
      const who = (it.participantIds ?? []).filter((id) => id !== target);
      return { ...it, participantIds: picked.has(i) ? [...who, target] : who };
    });
    const fallback = expense.claimRound?.status === "open" ? expense.claimRound.expected ?? [] : null;
    return itemizedSplits(next, expense.fees ?? [], expense.tip ?? 0, fallback)[target] ?? 0;
  }, [picked, items, expense, target]);

  function submit() {
    setConfirming(false);
    claimExpenseItems(group.id, expense.id, target, [...picked].sort((a, b) => a - b), true, {
      activity: makeActivity({
        type: "claim_submitted",
        actorId: meId,
        actorName: name(meId),
        label: expense.label,
        // Si marco por otro, el log deja constancia de por quién fue.
        ...(isMe ? {} : { toId: target, toName: name(target) }),
      }),
    });
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-lg p-5 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-display font-bold text-lg">{t("claim.title")}</h2>
          <button onClick={onClose} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted shrink-0">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="text-sm text-muted mb-3">{t("claim.subtitle", { label: expense.label })}</p>

        <div
          className="rounded-2xl px-3 py-2 mb-4 text-[12px] flex items-start gap-2"
          style={{ background: "rgba(15,163,163,.12)", color: "var(--teal)" }}
        >
          <Icon name="info" size={14} className="shrink-0 mt-0.5" />
          <span>{t("claim.instruction")}</span>
        </div>

        {canPickForOthers && targets.length > 1 && (
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-wide font-mono text-muted mb-1.5">
              {t("claim.forWho")}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {targets.map((id) => {
                const on = id === target;
                const picked_ = doneIds.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setTargetId(id)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
                    style={
                      on
                        ? { background: "linear-gradient(135deg, var(--teal), var(--indigo))", color: "#fff" }
                        : { background: "var(--glass)", color: "var(--muted)" }
                    }
                  >
                    {id === meId ? t("claim.me") : name(id)}
                    {picked_ && <Icon name="check" size={11} />}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted mt-1.5">{t("claim.forOthersHint")}</div>
          </div>
        )}

        <div className="space-y-2">
          {items.map((it, i) => {
            const others = (it.participantIds ?? []).filter((id) => id !== target);
            const mine = picked.has(i);
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                className="w-full glass rounded-2xl px-3 py-2.5 flex items-center gap-3 text-left hover-lift"
                style={mine ? { border: "1px solid var(--teal)" } : undefined}
              >
                <span
                  className="rounded-lg h-6 w-6 flex items-center justify-center shrink-0"
                  style={{
                    background: mine ? "var(--teal)" : "transparent",
                    border: mine ? "none" : "1px solid var(--line)",
                    color: "#fff",
                  }}
                >
                  {mine && <Icon name="check" size={14} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium">{it.name || "—"}</span>
                  <span className="block text-[11px] text-muted">
                    {others.length
                      ? t("claim.sharedBy", { n: others.length + (mine ? 1 : 0) })
                      : mine
                        ? ""
                        : t("claim.unclaimed")}
                  </span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {others.slice(0, 3).map((id) => {
                    const m = group.members.find((x) => x.id === id);
                    return <Avatar key={id} name={m?.name ?? "?"} avatar={m?.avatar} initials={m?.initials} size={20} />;
                  })}
                  <span className="font-mono text-sm ml-1">{money(it.price, group.currency)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {((expense.fees ?? []).length > 0 || (expense.tip ?? 0) > 0) && (
          <p className="text-[11px] text-muted mt-3">{t("scan.feesNote")}</p>
        )}

        <div className="glass rounded-2xl px-4 py-3 mt-4 flex items-center justify-between">
          <span className="text-sm text-muted">{t(isMe ? "claim.yourShare" : "claim.theirShare")}</span>
          <span className="font-mono font-bold">{money(myShare, group.currency)}</span>
        </div>

        <button
          onClick={() => setConfirming(true)}
          className="w-full rounded-2xl py-3 mt-4 font-semibold text-white hover-lift"
          style={{ background: "linear-gradient(135deg, var(--teal), var(--indigo))" }}
        >
          {picked.size === 0 ? t("claim.nothing") : t("claim.imDone")}
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-[1001] flex items-end sm:items-center justify-center bg-black/50 p-3"
          onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
        >
          <div
            className="glass-strong rounded-3xl w-full max-w-sm p-5 anim-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg mb-2">
              {isMe
                ? t(picked.size === 0 ? "claim.confirmNothingTitle" : "claim.confirmTitle")
                : t("claim.confirmForTitle", { name: name(target) })}
            </h3>
            <p className="text-sm text-muted mb-4">
              {isMe
                ? picked.size === 0
                  ? t("claim.confirmNothingBody")
                  : t("claim.confirmBody", { n: picked.size, total: items.length })
                : picked.size === 0
                  ? t("claim.confirmForNothingBody", { name: name(target) })
                  : t("claim.confirmForBody", { n: picked.size, total: items.length, name: name(target) })}
            </p>

            {picked.size > 0 && (
              <div className="glass rounded-2xl px-3 py-2.5 mb-4 space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide font-mono text-muted">
                  {t("claim.yourItems")}
                </div>
                {[...picked].sort((a, b) => a - b).map((i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{items[i]?.name || "—"}</span>
                    <span className="font-mono shrink-0">{money(items[i]?.price ?? 0, group.currency)}</span>
                  </div>
                ))}
                <div
                  className="flex items-center justify-between gap-2 text-sm pt-1.5"
                  style={{ borderTop: "1px solid var(--line)" }}
                >
                  <span className="text-muted">{t(isMe ? "claim.yourShare" : "claim.theirShare")}</span>
                  <span className="font-mono font-bold">{money(myShare, group.currency)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 glass rounded-2xl py-2.5 text-sm font-semibold"
              >
                {t("claim.confirmBack")}
              </button>
              <button
                onClick={submit}
                className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, var(--teal), var(--indigo))" }}
              >
                {t("claim.confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Overlay>
  );
}
