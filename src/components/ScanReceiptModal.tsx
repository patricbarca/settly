import { useState, type ChangeEvent } from "react";
import type { Group, Category, ExpenseItem } from "../lib/types";
import { scanReceipt, type ScanTax } from "../lib/ai";
import { updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uid, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { ItemizedExpenseEditor, type ItemizedInitial, type ItemizedResult } from "./ItemizedExpenseEditor";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function ScanReceiptModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const allIds = group.members.map((m) => m.id);
  const [stage, setStage] = useState<"pick" | "analyzing" | "review">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [scanError, setScanError] = useState(false);
  const [initial, setInitial] = useState<ItemizedInitial>({});
  const [tax, setTax] = useState<ScanTax | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setPreview(String(reader.result));
      setStage("analyzing");
      setScanError(false);
      try {
        const res = await scanReceipt(file);
        // Expandir cantidades: un "x2" se separa en líneas individuales.
        const itemRows: ExpenseItem[] = [];
        for (const s of res.items) {
          const q = Math.max(1, s.qty || 1);
          if (q > 1 && s.price > 0) {
            const unit = r2(s.unitPrice || s.price / q);
            for (let i = 0; i < q; i++) {
              const price = i === q - 1 ? r2(s.price - unit * (q - 1)) : unit;
              itemRows.push({ name: s.name, price, participantIds: allIds });
            }
          } else {
            itemRows.push({ name: s.name, price: s.price, participantIds: allIds });
          }
        }
        setInitial({
          label: res.description || "",
          category: res.category || "comida",
          items: itemRows.length ? itemRows : [{ name: res.description || "", price: res.total || 0, participantIds: allIds }],
          fees: res.fees || [],
        });
        setTax(res.tax && (res.tax.amount > 0 || res.tax.rate > 0) ? res.tax : null);
      } catch {
        setScanError(true);
        setInitial({ items: [{ name: "", price: 0, participantIds: allIds }], category: "comida" });
        setTax(null);
      }
      setStage("review");
    };
    reader.readAsDataURL(file);
  }

  function save(r: ItemizedResult) {
    const meName = group.members.find((m) => m.id === group.meId)?.name ?? "?";
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: [
        {
          id: uid(),
          label: r.label,
          amount: r.amount,
          payerId: r.payerId,
          participantIds: r.participantIds,
          category: r.category,
          date: new Date().toISOString().slice(0, 10),
          splits: r.splits,
          items: r.items,
          fees: r.fees,
          tip: r.tip,
          createdBy: group.meId,
        },
        ...g.expenses,
      ],
      notifications: withNotif(g, {
        type: "expense_added",
        actorId: group.meId,
        actorName: meName,
        label: r.label,
        amount: r.amount,
      }),
      activity: withActivity(g, {
        type: "scan_used",
        actorId: group.meId,
        actorName: meName,
        label: r.label,
        amount: r.amount,
      }),
    }));
    notifyGroup(
      group.id,
      group.name,
      t("notif.expense_added", { name: meName, label: "Ticket", amt: money(r.amount, group.currency) })
    );
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-lg p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl font-bold">{t("scan.title")}</h2>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {stage === "pick" && (
          <div>
            <p className="text-sm text-muted mb-4">{t("scan.pick")}</p>
            <label className="flex items-center justify-center gap-2 w-full rounded-full px-4 py-3 font-medium text-white hover-lift cursor-pointer" style={{ background: "var(--ink)" }}>
              <Icon name="camera" size={18} />
              {t("scan.camera")}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            </label>
            <label className="glass flex items-center justify-center gap-2 w-full rounded-full px-4 py-3 font-medium hover-lift cursor-pointer mt-2">
              <Icon name="plus" size={16} />
              {t("scan.gallery")}
              <input type="file" accept="image/*" className="hidden" onChange={onFile} />
            </label>
          </div>
        )}

        {stage === "analyzing" && (
          <div className="text-center py-8">
            {preview && <img src={preview} alt="" className="max-h-40 mx-auto rounded-xl mb-4" />}
            <div className="text-sm text-muted">{t("scan.analyzing")}</div>
          </div>
        )}

        {stage === "review" && (
          <>
            <p className="text-[11px] text-muted leading-relaxed mb-3">{t("scan.aiNote")}</p>
            <ItemizedExpenseEditor
              group={group}
              initial={initial}
              taxInfo={tax}
              banner={scanError ? t("scan.error") : undefined}
              submitLabel={t("scan.save")}
              onSubmit={save}
              onCancel={onClose}
            />
          </>
        )}
      </div>
    </Overlay>
  );
}
