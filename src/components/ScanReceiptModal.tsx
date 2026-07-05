import { useState, type ChangeEvent } from "react";
import type { Group, Category, ExpenseItem } from "../lib/types";
import { scanReceipt, type ScanTax } from "../lib/ai";
import { updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uploadReceipt } from "../lib/storage";
import { uid, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { usePlan } from "../lib/plan";
import { convertCurrency, fmtRate } from "../lib/fx";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";
import { ItemizedExpenseEditor, type ItemizedInitial, type ItemizedResult } from "./ItemizedExpenseEditor";

const r2 = (n: number) => Math.round(n * 100) / 100;

type FxInfo = { originalAmount: number; originalCurrency: string; fxRate: number };

export function ScanReceiptModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const plan = usePlan();
  const allIds = group.members.map((m) => m.id);
  const [stage, setStage] = useState<"pick" | "analyzing" | "review">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [scanError, setScanError] = useState(false);
  const [initial, setInitial] = useState<ItemizedInitial>({});
  const [tax, setTax] = useState<ScanTax | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [fx, setFx] = useState<FxInfo | null>(null);
  const [fxUpsell, setFxUpsell] = useState<string | null>(null); // moneda detectada, si es free
  const [fxError, setFxError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = async () => {
      setPreview(String(reader.result));
      setStage("analyzing");
      setScanError(false);
      setFx(null);
      setFxUpsell(null);
      setFxError(null);
      try {
        const res = await scanReceipt(file);

        // Moneda distinta a la del grupo: convertir (Pro) o avisar (free).
        let rate = 1;
        const scannedCode = (res.currency || "").toUpperCase().trim();
        if (scannedCode && scannedCode !== group.currency) {
          if (plan === "pro") {
            const fxRes = await convertCurrency(1, scannedCode, group.currency);
            if (fxRes) {
              rate = fxRes.rate;
              setFx({ originalAmount: res.total || 0, originalCurrency: scannedCode, fxRate: rate });
            } else {
              setFxError(scannedCode);
            }
          } else {
            setFxUpsell(scannedCode);
          }
        }
        const conv = (n: number) => r2(n * rate);

        // Expandir cantidades: un "x2" se separa en líneas individuales.
        const itemRows: ExpenseItem[] = [];
        for (const s of res.items) {
          const q = Math.max(1, s.qty || 1);
          if (q > 1 && s.price > 0) {
            const unit = r2(s.unitPrice || s.price / q);
            for (let i = 0; i < q; i++) {
              const price = conv(i === q - 1 ? r2(s.price - unit * (q - 1)) : unit);
              itemRows.push({ name: s.name, price, participantIds: allIds });
            }
          } else {
            itemRows.push({ name: s.name, price: conv(s.price), participantIds: allIds });
          }
        }
        setInitial({
          label: res.description || "",
          category: res.category || "comida",
          items: itemRows.length
            ? itemRows
            : [{ name: res.description || "", price: conv(res.total || 0), participantIds: allIds }],
          fees: (res.fees || []).map((f) => ({ ...f, amount: conv(f.amount) })),
        });
        setTax(
          res.tax && (res.tax.amount > 0 || res.tax.rate > 0)
            ? { ...res.tax, amount: conv(res.tax.amount) }
            : null
        );
      } catch {
        setScanError(true);
        setInitial({ items: [{ name: "", price: 0, participantIds: allIds }], category: "comida" });
        setTax(null);
      }
      setStage("review");
    };
    reader.readAsDataURL(file);
  }

  async function save(r: ItemizedResult) {
    const meName = group.members.find((m) => m.id === group.meId)?.name ?? "?";
    // Sube la foto del ticket a Storage (no bloquea: si falla, guardamos sin foto).
    setSaving(true);
    const receiptPath = file ? await uploadReceipt(group.id, file) : null;
    setSaving(false);
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
          ...(receiptPath ? { receiptPath } : {}),
          ...(fx ? { originalAmount: fx.originalAmount, originalCurrency: fx.originalCurrency, fxRate: fx.fxRate } : {}),
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

            {fx && (
              <div className="glass rounded-xl px-3 py-2 mb-3 text-xs" style={{ color: "var(--teal)" }}>
                {t("scan.fxConverted", {
                  amt: money(fx.originalAmount, fx.originalCurrency),
                  rate: `1 ${fx.originalCurrency} ≈ ${fmtRate(fx.fxRate)} ${group.currency}`,
                })}
              </div>
            )}
            {fxError && (
              <div className="rounded-xl px-3 py-2 mb-3 text-xs" style={{ background: "rgba(255,90,77,0.12)", color: "var(--coral)" }}>
                {t("scan.fxFailed", { code: fxError })}
              </div>
            )}
            {fxUpsell && (
              <div className="glass rounded-xl px-3 py-2 mb-3 flex items-center justify-between gap-2 text-xs">
                <span>{t("scan.fxUpsell", { code: fxUpsell, target: group.currency })}</span>
                <button
                  onClick={() => setShowPaywall(true)}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white hover-lift"
                  style={{ background: "var(--indigo)" }}
                >
                  {t("scan.fxUpsellCta")}
                </button>
              </div>
            )}

            <ItemizedExpenseEditor
              group={group}
              initial={initial}
              taxInfo={tax}
              banner={scanError ? t("scan.error") : undefined}
              submitLabel={t("scan.save")}
              submitting={saving}
              onSubmit={save}
              onCancel={onClose}
            />
          </>
        )}
      </div>
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </Overlay>
  );
}
