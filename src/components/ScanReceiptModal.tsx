import { useState, type ChangeEvent } from "react";
import type { Group, Category, ExpenseItem } from "../lib/types";
import { scanReceipt, type ScanResult, type ScanTax } from "../lib/ai";
import { addExpense } from "../lib/store";
import { makeNotif } from "../lib/notifications";
import { makeActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uploadReceipt } from "../lib/storage";
import { uid, money } from "../lib/format";
import { useT, useLang } from "../lib/i18n";
import { usePlan } from "../lib/plan";
import { convertCurrency, fmtRate } from "../lib/fx";
import { CURRENCIES, localCurrencyName } from "../lib/currencies";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";
import { ItemizedExpenseEditor, type ItemizedInitial, type ItemizedResult } from "./ItemizedExpenseEditor";

const r2 = (n: number) => Math.round(n * 100) / 100;

type FxInfo = { originalAmount: number; originalCurrency: string; fxRate: number };

export function ScanReceiptModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const plan = usePlan();
  const allIds = group.members.map((m) => m.id);
  const [stage, setStage] = useState<"pick" | "analyzing" | "currency" | "review">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [scanError, setScanError] = useState(false);
  const [initial, setInitial] = useState<ItemizedInitial>({});
  const [tax, setTax] = useState<ScanTax | null>(null);
  // Total impreso en el ticket (convertido a la moneda del grupo) para avisar
  // si la suma de los ítems leídos no cuadra con él.
  const [scannedTotal, setScannedTotal] = useState<number | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [fx, setFx] = useState<FxInfo | null>(null);
  const [fxUpsell, setFxUpsell] = useState<string | null>(null); // moneda detectada, si es free
  const [fxError, setFxError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingScan, setPendingScan] = useState<ScanResult | null>(null);
  const [otherCurrency, setOtherCurrency] = useState("");

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
        const detected = (res.currency || "").toUpperCase().trim() || "EUR";
        setPendingScan(res);
        setOtherCurrency(detected);
        setStage("currency");
        return;
      } catch {
        setScanError(true);
        setInitial({ items: [{ name: "", price: 0, participantIds: allIds }], category: "comida" });
        setTax(null);
        setStage("review");
      }
    };
    reader.readAsDataURL(file);
  }

  // El usuario confirma (o corrige) la moneda detectada por la IA antes de
  // aplicar la conversión — el escaneo puede fallar al detectarla si el
  // ticket no trae símbolo/código visible (el prompt cae a EUR por defecto).
  async function confirmCurrency(code: string) {
    const res = pendingScan;
    if (!res) return;
    setPendingScan(null);
    setStage("analyzing");

    let rate = 1;
    let fxInfo: FxInfo | null = null;
    if (code !== group.currency) {
      if (plan === "pro") {
        const fxRes = await convertCurrency(1, code, group.currency);
        if (fxRes) {
          rate = fxRes.rate;
          fxInfo = { originalAmount: res.total || 0, originalCurrency: code, fxRate: rate };
          setFx(fxInfo);
        } else {
          setFxError(code);
        }
      } else {
        setFxUpsell(code);
      }
    }
    const conv = (n: number) => r2(n * rate);
    setScannedTotal(res.total ? conv(res.total) : undefined);

    // Un "x24" ya NO se explota automáticamente en 24 líneas: queda como una
    // sola fila con `qty` adjunto (botón "Partir en N" en el editor, para
    // asignar cada unidad a una persona distinta). Guarda también el precio
    // nativo (originalPrice) tal cual lo detectó el escaneo, sin convertir —
    // permite validar el escaneo contra el ticket real en vez de reconvertir
    // el monto ya convertido (que arrastraría el redondeo).
    //
    // Participantes por defecto: si hay tantas o más personas en el grupo
    // que unidades del ítem, es plausible que sea "una por persona" (p. ej.
    // 24 cubiertos de banquete para 24 comensales) — se preseleccionan todos
    // para que baste con quitar a quien no participó. Si hay MENOS personas
    // que unidades, no hay un reparto por defecto razonable: se deja vacío
    // para que se asigne a mano (normalmente partiendo en N).
    const itemRows: (ExpenseItem & { qty?: number })[] = res.items.map((s) => {
      const q = Math.max(1, s.qty || 1);
      const defaultIds = allIds.length >= q ? allIds : [];
      return {
        name: s.name,
        price: conv(s.price),
        originalPrice: s.price,
        participantIds: defaultIds,
        ...(q > 1 ? { qty: q } : {}),
      };
    });
    const scannedFees = (res.fees || []).map((f) => ({ ...f, amount: conv(f.amount), originalAmount: f.amount }));
    // Si el impuesto NO está incluido en los precios (p. ej. "VAT 8%" que se
    // suma al subtotal), antes se mostraba solo como nota informativa y
    // nunca se sumaba al total a repartir — el grupo terminaba pagando de
    // menos. Ahora se agrega como un recargo editable más (se reparte
    // proporcional al consumo, igual que cualquier otro recargo del ticket).
    //
    // Red de seguridad: muchos tickets (AU/NZ en particular) muestran un
    // desglose "GST Sales / GST Amount" puramente informativo, con el
    // subtotal y el total pagado siendo el MISMO número — el impuesto ya
    // está dentro del precio de cada línea. Si el modelo de visión etiqueta
    // esto como `included: false` por error, sumarlo aparte duplicaría el
    // impuesto. Cuando subtotal y total prácticamente coinciden, no puede
    // haber un impuesto añadido encima: se fuerza `included` sin importar lo
    // que haya devuelto el escaneo.
    const gapCoversTax =
      res.subtotal > 0 && res.total > 0 && res.total - res.subtotal > Math.max(0.01, res.tax.amount * 0.5);
    const taxIncluded = !res.tax || res.tax.amount <= 0 || res.tax.included || !gapCoversTax;
    const taxNotIncluded = res.tax && res.tax.amount > 0 && !taxIncluded;
    const baseFees = taxNotIncluded
      ? [
          ...scannedFees,
          {
            name: t("scan.taxFeeName", { rate: String(res.tax!.rate || 0) }),
            amount: conv(res.tax!.amount),
            originalAmount: res.tax!.amount,
          },
        ]
      : scannedFees;
    // Recargo automático (p. ej. surcharge por tarjeta de crédito): si los
    // ítems cuadran con el SUBTOTAL impreso pero el TOTAL pagado es mayor, ese
    // hueco es un cargo real que no vino como línea (recargo de tarjeta,
    // redondeo, levy…). Se añade como recargo editable para que "Total a
    // repartir" = lo que de verdad se pagó, y se reparte proporcional al
    // consumo. Solo cuando (a) los ítems reconcilian con el subtotal y (b) el
    // hueco es pequeño (≤3% o ≤$2) — un hueco grande es un misread y se deja
    // que salte el aviso, sin taparlo.
    const itemsSum = itemRows.reduce((s, it) => s + (Number(it.price) || 0), 0);
    const baseFeesSum = baseFees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const totalConv = res.total ? conv(res.total) : 0;
    const subtotalConv = res.subtotal ? conv(res.subtotal) : 0;
    const residual = r2(totalConv - r2(itemsSum + baseFeesSum));
    const itemsMatchSubtotal =
      subtotalConv > 0 && Math.abs(itemsSum - subtotalConv) <= Math.max(0.02, subtotalConv * 0.005);
    const surchargeCap = Math.max(2, totalConv * 0.03);
    const fees =
      itemsMatchSubtotal && residual > 0.02 && residual <= surchargeCap
        ? [
            ...baseFees,
            {
              name: t("scan.surchargeAuto"),
              amount: residual,
              ...(rate !== 1 ? { originalAmount: r2(residual / rate) } : {}),
            },
          ]
        : baseFees;
    setInitial({
      label: res.description || "",
      category: res.category || "comida",
      items: itemRows.length
        ? itemRows
        : [{ name: res.description || "", price: conv(res.total || 0), originalPrice: res.total || 0, participantIds: allIds }],
      fees,
      ...(fxInfo ? { originalCurrency: fxInfo.originalCurrency, fxRate: fxInfo.fxRate } : {}),
    });
    // El estado `tax` (nota informativa de solo lectura) solo aplica cuando
    // el impuesto ya está incluido en los precios — si no lo está, ahora es
    // un recargo normal y ya se ve/edita en la sección de Recargos.
    setTax(res.tax && res.tax.amount > 0 && taxIncluded ? { ...res.tax, amount: conv(res.tax.amount), originalAmount: res.tax.amount } : null);
    setStage("review");
  }

  async function save(r: ItemizedResult) {
    const meName = group.members.find((m) => m.id === group.meId)?.name ?? "?";
    // Sube la foto del ticket a Storage (no bloquea: si falla, guardamos sin foto).
    setSaving(true);
    const receiptPath = file ? await uploadReceipt(group.id, file) : null;
    setSaving(false);
    addExpense(
      group.id,
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
        allowEdits: r.allowEdits,
        ...(receiptPath ? { receiptPath } : {}),
        ...(fx ? { originalAmount: fx.originalAmount, originalCurrency: fx.originalCurrency, fxRate: fx.fxRate } : {}),
        createdBy: group.meId,
      },
      {
        notifAdd: makeNotif({
          type: "expense_added",
          actorId: group.meId,
          actorName: meName,
          label: r.label,
          amount: r.amount,
        }),
        activity: makeActivity({
          type: "scan_used",
          actorId: group.meId,
          actorName: meName,
          label: r.label,
          amount: r.amount,
        }),
      }
    );
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

        {stage === "currency" && pendingScan && (() => {
          const detected = (pendingScan.currency || "EUR").toUpperCase().trim();
          // Solo mostramos como botón de un toque las monedas del grupo que
          // coinciden con lo detectado — mostrar AUD/VND cuando la IA leyó
          // EUR sugeriría falsamente que esas son las opciones detectadas.
          const quickPicks = [group.currency, group.secondaryCurrency].filter(
            (c): c is string => !!c && c === detected
          );
          return (
          <div className="py-2">
            <h3 className="font-semibold mb-1">{t("scan.confirmCurrencyTitle")}</h3>
            <p className="text-sm text-muted mb-4">
              {t("scan.confirmCurrencyBody", { code: detected })}
            </p>
            {quickPicks.length > 0 && (
              <div className="flex gap-2 mb-4">
                {quickPicks.map((c) => (
                  <button
                    key={c}
                    onClick={() => confirmCurrency(c)}
                    className="flex-1 rounded-full px-4 py-3 font-semibold text-white hover-lift"
                    style={{ background: "var(--ink)" }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted mb-2">
              {t(quickPicks.length > 0 ? "scan.confirmCurrencyOther" : "scan.confirmCurrencyPick")}
            </p>
            <div className="flex gap-2">
              <select
                value={otherCurrency}
                onChange={(e) => setOtherCurrency(e.target.value)}
                className="glass rounded-xl px-3 py-2.5 text-sm flex-1"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {localCurrencyName(c.code, lang === "es" ? "es-ES" : "en-US")}
                  </option>
                ))}
              </select>
              <button
                onClick={() => confirmCurrency(otherCurrency)}
                className="glass rounded-full px-4 py-2.5 text-sm font-semibold hover-lift shrink-0"
              >
                {t("scan.confirmCurrencyConfirm")}
              </button>
            </div>
          </div>
          );
        })()}

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
              scannedTotal={scannedTotal}
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
