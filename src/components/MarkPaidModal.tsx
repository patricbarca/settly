import { useState, type ChangeEvent } from "react";
import type { Group } from "../lib/types";
import { updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uid, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export function MarkPaidModal({
  group,
  from,
  to,
  amount,
  onClose,
}: {
  group: Group;
  from: string;
  to: string;
  amount: number;
  onClose: () => void;
}) {
  const t = useT();
  const max = Math.round(amount * 100) / 100;
  const [amt, setAmt] = useState(String(max));
  const [proof, setProof] = useState<string | undefined>();
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  // Monto a registrar: lo escrito, acotado a (0, total adeudado].
  const value = Math.min(Math.max(0, Number(amt) || 0), max);
  const valid = value > 0.005;
  const remaining = Math.round((max - value) * 100) / 100;

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setProof(String(r.result));
    r.readAsDataURL(f);
  }

  function confirm() {
    if (!valid) return;
    const paidAmt = Math.round(value * 100) / 100;
    updateGroup(group.id, (g) => ({
      ...g,
      settlements: [
        ...(g.settlements ?? []),
        {
          id: uid(),
          from,
          to,
          amount: paidAmt,
          date: new Date().toISOString().slice(0, 10),
          // Lo marca el deudor ("ya pagué") → queda PENDIENTE hasta que quien
          // cobra lo confirme o lo rechace. Puede ser un pago PARCIAL.
          status: "pending",
          proof,
        },
      ],
      notifications: withNotif(g, {
        type: "payment_made",
        actorId: from,
        actorName: name(from),
        toName: name(to),
        amount: paidAmt,
      }),
      activity: withActivity(g, {
        type: "payment_made",
        actorId: from,
        actorName: name(from),
        toName: name(to),
        amount: paidAmt,
      }),
    }));
    notifyGroup(
      group.id,
      group.name,
      t("notif.payment_made", { name: name(from), amt: money(paidAmt, group.currency), to: name(to) })
    );
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold mb-1">{t("pay.markTitle")}</h3>
        <p className="text-sm text-muted mb-4">
          {t("pay.markDesc", { amt: money(max, group.currency), to: name(to) })}
        </p>

        {/* Monto pagado (permite pago parcial) */}
        <label className="text-xs font-semibold text-muted">{t("pay.amountPaid")}</label>
        <div className="flex gap-2 mt-1">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={max}
            step="0.01"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            className="glass rounded-xl px-3 py-2.5 text-sm flex-1 font-mono"
          />
          <button
            type="button"
            onClick={() => setAmt(String(max))}
            className="glass rounded-xl px-3 text-xs font-semibold text-muted hover-lift shrink-0"
          >
            {t("pay.full")}
          </button>
        </div>
        {valid && remaining > 0.005 && (
          <div className="text-[11px] text-muted mt-1.5">
            {t("pay.remaining", { amt: money(remaining, group.currency) })}
          </div>
        )}

        <label className="text-xs font-semibold text-muted block mt-4">{t("pay.attach")}</label>
        <label className="glass rounded-xl px-3 py-3 text-sm w-full mt-1 flex items-center justify-center gap-2 cursor-pointer text-muted hover-lift">
          <Icon name="paperclip" size={16} />
          {proof && <Icon name="check" size={16} style={{ color: "#0A8B5E" }} />}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
        {proof && <img src={proof} alt="" className="max-h-32 rounded-xl mt-2 mx-auto" />}

        <div className="flex gap-2 mt-4">
          <button
            onClick={confirm}
            disabled={!valid}
            className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-40"
          >
            {t("pay.confirmPay")}
          </button>
          <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
