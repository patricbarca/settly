import { useState } from "react";
import type { Group, Category, ExpenseItem, SplitMode } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import type { ScanTax } from "../lib/ai";
import { uid, money, personColor, memberInitials, sortedMembers } from "../lib/format";
import { currencySymbol } from "../lib/currencies";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

type Item = {
  id: string;
  name: string;
  price: number | string;
  who: Set<string>;
  originalPrice?: number | string;
  /** Cantidad detectada en el ticket (p. ej. "24 banquet") mientras sigue en
   *  una sola línea sin partir — habilita el botón "Partir en N". Se pierde
   *  al partir (cada unidad ya es una línea normal) y nunca se persiste. */
  qty?: number;
};
type Fee = { id: string; name: string; amount: number | string; originalAmount?: number | string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Inicializa los valores de reparto (%, importe o partes) para un modo, una
 *  lista de participantes y un total dado. El resto va al último. */
function initSplitVals(mode: SplitMode, ids: string[], total: number): Record<string, number> {
  const n = ids.length;
  const vals: Record<string, number> = {};
  if (n === 0) return vals;
  if (mode === "percent") {
    const base = Math.floor(100 / n);
    ids.forEach((id, i) => (vals[id] = base + (i === n - 1 ? 100 - base * n : 0)));
  } else if (mode === "exact") {
    const base = Math.floor((total / n) * 100) / 100;
    ids.forEach((id, i) => (vals[id] = i === n - 1 ? r2(total - base * (n - 1)) : base));
  } else if (mode === "shares") {
    ids.forEach((id) => (vals[id] = 1));
  }
  return vals;
}

export type ItemizedResult = {
  label: string;
  amount: number;
  payerId: string;
  participantIds: string[];
  category: Category;
  splits: Record<string, number>;
  items: ExpenseItem[];
  fees: { name: string; amount: number; originalAmount?: number }[];
  tip: number;
  allowEdits: boolean;
};

export type ItemizedInitial = {
  label?: string;
  items?: (ExpenseItem & { qty?: number })[];
  fees?: { name: string; amount: number; originalAmount?: number }[];
  tip?: number;
  payerId?: string;
  category?: Category;
  /** Si true, cualquier participante puede editar este gasto (no solo quien lo creó). */
  allowEdits?: boolean;
  /** Moneda/tasa del ticket original (si se escaneó en otra moneda distinta
   *  a la del grupo) — habilita el toggle para ajustar montos en cualquiera
   *  de las dos monedas. */
  originalCurrency?: string;
  fxRate?: number;
};

/** Editor de un gasto repartido por ítem/plato. Lo usan el escaneo de tickets
 *  (tras leer la foto) y la edición de un gasto que ya tiene `items`. Calcula el
 *  reparto: ítems entre sus consumidores, recargos proporcional, propina igual. */
export function ItemizedExpenseEditor({
  group,
  initial,
  submitLabel,
  banner,
  taxInfo,
  scannedTotal,
  submitting,
  onSubmit,
  onCancel,
}: {
  group: Group;
  initial: ItemizedInitial;
  submitLabel: string;
  banner?: string;
  taxInfo?: ScanTax | null;
  /** Total impreso en el ticket (en la moneda del grupo). Si la suma de los
   *  ítems no cuadra con él, se avisa — así se detecta un escaneo mal leído. */
  scannedTotal?: number;
  submitting?: boolean;
  onSubmit: (r: ItemizedResult) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const members = sortedMembers(group.members);
  const allIds = group.members.map((m) => m.id);
  const cur = currencySymbol(group.currency);
  const { originalCurrency, fxRate } = initial;
  const canToggle = !!(originalCurrency && fxRate);

  const [label, setLabel] = useState(initial.label ?? "");
  const [category, setCategory] = useState<Category>(initial.category ?? "comida");
  const [payerId, setPayerId] = useState(initial.payerId ?? group.meId);
  const [allowEdits, setAllowEdits] = useState(initial.allowEdits ?? false);
  const [tip, setTip] = useState<number | string>(initial.tip ? String(initial.tip) : "");
  // Ver/ajustar los montos en la moneda del ticket original en vez de la
  // convertida (moneda del grupo) — solo disponible si el escaneo detectó
  // una moneda distinta y la convirtió (Pro).
  const [showOriginal, setShowOriginal] = useState(false);
  const [items, setItems] = useState<Item[]>(() =>
    (initial.items?.length ? initial.items : [{ name: "", price: 0, participantIds: allIds }]).map((it) => ({
      id: uid(),
      name: it.name,
      price: it.price || "",
      // ?? (no .length ?) para respetar un participantIds=[] deliberado (p.
      // ej. un ítem de cantidad múltiple sin asignar todavía); solo cae a
      // allIds cuando el campo no viene informado en absoluto.
      who: new Set(it.participantIds ?? allIds),
      originalPrice: it.originalPrice,
      qty: it.qty,
    }))
  );
  const [fees, setFees] = useState<Fee[]>(() =>
    (initial.fees ?? []).map((f) => ({ id: uid(), name: f.name, amount: f.amount, originalAmount: f.originalAmount }))
  );
  // Modo del editor: "items" (por defecto, reparto por ítem/plato) o "total"
  // (desactivar la itemización → un solo monto repartido en partes iguales; se
  // guarda como gasto normal, sin items). El monto total se pre-rellena con la
  // suma de los ítems al cambiar de modo.
  const [mode, setMode] = useState<"items" | "total">("items");
  const [totalAmount, setTotalAmount] = useState<number | string>("");
  const [totalWho, setTotalWho] = useState<Set<string>>(new Set(allIds));
  // Reparto del modo "total": = (partes iguales), % , importe exacto, ×partes.
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [splitVals, setSplitVals] = useState<Record<string, number>>({});
  // Lista ordenada (según el orden de miembros) de quién participa en el total.
  const totalWhoIds = members.map((m) => m.id).filter((id) => totalWho.has(id));

  function reinitSplit(mode: SplitMode, whoIds: string[], amt: number) {
    setSplitVals(mode === "equal" ? {} : initSplitVals(mode, whoIds, amt));
  }
  function changeSplitMode(mode: SplitMode) {
    setSplitMode(mode);
    reinitSplit(mode, totalWhoIds, r2(Number(totalAmount) || 0));
  }
  function toggleTotalWho(mid: string) {
    setTotalWho((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      const whoIds = members.map((m) => m.id).filter((id) => next.has(id));
      if (splitMode !== "equal") reinitSplit(splitMode, whoIds, r2(Number(totalAmount) || 0));
      return next;
    });
  }
  function onTotalAmountChange(raw: string) {
    setTotalAmount(raw);
    if (splitMode === "exact" || splitMode === "percent") {
      reinitSplit(splitMode, totalWhoIds, r2(Number(raw) || 0));
    }
  }
  // Edita un valor de reparto; en % / importe autocompleta el último con el resto.
  function setSplitVal(id: string, val: number) {
    setSplitVals((prev) => {
      const next = { ...prev, [id]: val };
      if ((splitMode === "exact" || splitMode === "percent") && totalWhoIds.length >= 2) {
        const lastId = totalWhoIds[totalWhoIds.length - 1];
        if (id !== lastId) {
          const cap = splitMode === "percent" ? 100 : r2(Number(totalAmount) || 0);
          const others = totalWhoIds.filter((x) => x !== lastId).reduce((a, x) => a + (Number(next[x]) || 0), 0);
          const rem = r2(cap - others);
          next[lastId] = rem > 0 ? rem : 0;
        }
      }
      return next;
    });
  }

  function toggle(itemId: string, mid: string) {
    setItems((arr) =>
      arr.map((it) => {
        if (it.id !== itemId) return it;
        const who = new Set(it.who);
        if (who.has(mid)) who.delete(mid);
        else who.add(mid);
        return { ...it, who };
      })
    );
  }
  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  // Valor a mostrar en el input cuando se ve la moneda original: si no se
  // guardó el precio nativo (gastos previos a esta función, o líneas
  // agregadas/editadas a mano), lo aproxima reconvirtiendo con fxRate en vez
  // de dejarlo en blanco (que antes se veía/leía como "0").
  function origDisplay(price: number | string, orig: number | string | undefined) {
    if (orig != null && orig !== "") return orig;
    if (!fxRate) return "";
    const n = Number(price) || 0;
    return n ? String(r2(n / fxRate)) : "";
  }
  // Edita el precio en la moneda actualmente visible (según el toggle) y
  // recalcula la otra a partir de fxRate, para que ambas queden sincronizadas.
  function setItemPrice(id: string, raw: string) {
    setItems((arr) =>
      arr.map((it) => {
        if (it.id !== id) return it;
        if (showOriginal && fxRate) {
          const conv = raw === "" ? it.price : r2(Number(raw) * fxRate);
          return { ...it, originalPrice: raw, price: conv };
        }
        const orig = fxRate ? (raw === "" ? it.originalPrice : r2(Number(raw) / fxRate)) : it.originalPrice;
        return { ...it, price: raw, originalPrice: orig };
      })
    );
  }
  const addItem = () =>
    setItems((arr) => [...arr, { id: uid(), name: "", price: "", who: new Set(allIds), originalPrice: canToggle ? "" : undefined }]);
  const removeItem = (id: string) => setItems((arr) => arr.filter((it) => it.id !== id));
  function splitItem(id: string) {
    setItems((arr) => {
      const idx = arr.findIndex((it) => it.id === id);
      if (idx < 0) return arr;
      const it = arr[idx];
      const p = Number(it.price) || 0;
      const half = r2(p / 2);
      // Al partir en dos deja de corresponder a una única línea del ticket.
      const a: Item = { ...it, id: uid(), price: half, who: new Set(it.who), originalPrice: undefined };
      const b: Item = { ...it, id: uid(), price: r2(p - half), who: new Set(it.who), originalPrice: undefined };
      return [...arr.slice(0, idx), a, b, ...arr.slice(idx + 1)];
    });
  }
  // Explota una línea de cantidad múltiple (p. ej. "24 banquet") en N líneas
  // individuales de precio unitario, sin nadie asignado — cada una se
  // reparte a mano (normalmente a una sola persona). Deja de ser "de
  // cantidad" (pierde `qty`) una vez partida.
  function splitQty(id: string) {
    setItems((arr) => {
      const idx = arr.findIndex((it) => it.id === id);
      if (idx < 0) return arr;
      const it = arr[idx];
      const q = it.qty || 1;
      if (q <= 1) return arr;
      const p = Number(it.price) || 0;
      const unit = r2(p / q);
      const origTotal = it.originalPrice != null && it.originalPrice !== "" ? Number(it.originalPrice) : undefined;
      const origUnit = origTotal != null ? r2(origTotal / q) : undefined;
      const rows: Item[] = Array.from({ length: q }, (_, i) => ({
        id: uid(),
        name: it.name,
        price: i === q - 1 ? r2(p - unit * (q - 1)) : unit,
        who: new Set<string>(),
        originalPrice: origUnit != null ? (i === q - 1 ? r2(origTotal! - origUnit * (q - 1)) : origUnit) : undefined,
      }));
      return [...arr.slice(0, idx), ...rows, ...arr.slice(idx + 1)];
    });
  }
  const selectAll = (id: string) => setItem(id, { who: new Set(allIds) });
  const deselectAll = (id: string) => setItem(id, { who: new Set() });
  const setFee = (id: string, patch: Partial<Fee>) =>
    setFees((arr) => arr.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  function setFeeAmount(id: string, raw: string) {
    setFees((arr) =>
      arr.map((f) => {
        if (f.id !== id) return f;
        if (showOriginal && fxRate) {
          const conv = raw === "" ? f.amount : r2(Number(raw) * fxRate);
          return { ...f, originalAmount: raw, amount: conv };
        }
        const orig = fxRate ? (raw === "" ? f.originalAmount : r2(Number(raw) / fxRate)) : f.originalAmount;
        return { ...f, amount: raw, originalAmount: orig };
      })
    );
  }
  const addFee = () => setFees((arr) => [...arr, { id: uid(), name: "", amount: "", originalAmount: canToggle ? "" : undefined }]);
  const removeFee = (id: string) => setFees((arr) => arr.filter((f) => f.id !== id));
  // Propina: no viene del ticket (se añade después), así que no persiste un
  // "original" propio — solo se convierte al vuelo para mostrarla/editarla
  // en la moneda visible; el valor guardado sigue en la moneda del grupo.
  const tipDisplay = showOriginal && fxRate ? (tip === "" ? "" : String(r2(Number(tip) / fxRate))) : tip;
  function onTipChange(raw: string) {
    if (showOriginal && fxRate) setTip(raw === "" ? "" : String(r2(Number(raw) * fxRate)));
    else setTip(raw);
  }

  // --- Reparto (siempre en la moneda del grupo, para el reparto real) ---
  const itemsTotal = items.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const feesTotal = fees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const tipNum = Number(tip) || 0;
  const isTotalMode = mode === "total";
  const total = isTotalMode ? r2(Number(totalAmount) || 0) : r2(itemsTotal + feesTotal + tipNum);
  const originalTotal = canToggle
    ? r2(
        items.reduce((s, it) => s + (Number(it.originalPrice ?? (Number(it.price) || 0) / fxRate!) || 0), 0) +
          fees.reduce((s, f) => s + (Number(f.originalAmount ?? (Number(f.amount) || 0) / fxRate!) || 0), 0) +
          tipNum / fxRate!
      )
    : 0;
  const originalItemsTotal = canToggle
    ? r2(items.reduce((s, it) => s + (Number(it.originalPrice ?? (Number(it.price) || 0) / fxRate!) || 0), 0))
    : 0;

  const splits: Record<string, number> = {};
  allIds.forEach((id) => (splits[id] = 0));
  if (isTotalMode) {
    // Modo "solo total": reparto entre los seleccionados según splitMode.
    const who = totalWhoIds;
    if (who.length && total > 0) {
      if (splitMode === "equal") {
        const per = total / who.length;
        who.forEach((id) => (splits[id] += per));
      } else if (splitMode === "percent") {
        who.forEach((id) => (splits[id] += ((Number(splitVals[id]) || 0) / 100) * total));
      } else if (splitMode === "exact") {
        who.forEach((id) => (splits[id] += Number(splitVals[id]) || 0));
      } else if (splitMode === "shares") {
        const ts = who.reduce((a, id) => a + (Number(splitVals[id]) || 0), 0);
        if (ts > 0) who.forEach((id) => (splits[id] += ((Number(splitVals[id]) || 0) / ts) * total));
      }
    }
  } else {
    items.forEach((it) => {
      const who = [...it.who];
      if (!who.length) return;
      const per = (Number(it.price) || 0) / who.length;
      who.forEach((id) => (splits[id] += per));
    });
    const itemParticipants = allIds.filter((id) => splits[id] > 0.001);
    if (feesTotal > 0 && itemsTotal > 0) {
      itemParticipants.forEach((id) => (splits[id] += feesTotal * (splits[id] / itemsTotal)));
    }
    if (tipNum > 0 && itemParticipants.length) {
      const perTip = tipNum / itemParticipants.length;
      itemParticipants.forEach((id) => (splits[id] += perTip));
    }
  }
  const participants = allIds.filter((id) => splits[id] > 0.001);

  // Validez del reparto en modo total con % / importe exacto: la suma debe
  // cuadrar (100% o el total). En = y × siempre es válido si hay participantes.
  let totalSplitValid = true;
  let totalSplitHint: string | null = null;
  if (isTotalMode && (splitMode === "percent" || splitMode === "exact") && totalWhoIds.length > 0) {
    const sum = totalWhoIds.reduce((a, id) => a + (Number(splitVals[id]) || 0), 0);
    if (splitMode === "percent") {
      totalSplitValid = Math.abs(sum - 100) < 0.5;
      totalSplitHint = `${sum.toFixed(1)}% / 100%`;
    } else {
      totalSplitValid = Math.abs(sum - total) < 0.02;
      totalSplitHint = `${money(sum, group.currency)} / ${money(total, group.currency)}`;
    }
  }
  const canSubmit = total > 0 && participants.length > 0 && totalSplitValid;

  function submit() {
    if (!canSubmit) return;
    const rounded: Record<string, number> = {};
    allIds.forEach((id) => (rounded[id] = r2(splits[id])));
    onSubmit({
      label: label.trim() || "Ticket",
      amount: total,
      payerId,
      participantIds: participants,
      category,
      splits: rounded,
      // En modo "solo total" no se guardan ítems/recargos/propina → gasto normal.
      items: isTotalMode
        ? []
        : items
            .filter((it) => (Number(it.price) || 0) > 0 || it.name.trim())
            .map((it) => ({
              name: it.name.trim(),
              price: Number(it.price) || 0,
              participantIds: [...it.who],
              ...(it.originalPrice != null && it.originalPrice !== "" ? { originalPrice: Number(it.originalPrice) } : {}),
            })),
      fees: isTotalMode
        ? []
        : fees
            .filter((f) => Math.abs(Number(f.amount) || 0) > 0.0001)
            .map((f) => ({
              name: f.name.trim(),
              amount: Number(f.amount) || 0,
              ...(f.originalAmount != null && f.originalAmount !== "" ? { originalAmount: Number(f.originalAmount) } : {}),
            })),
      tip: isTotalMode ? 0 : tipNum,
      allowEdits,
    });
  }

  return (
    <div className="space-y-3">
      {banner && (
        <div
          className="rounded-2xl px-4 py-3 text-sm"
          style={{ background: "rgba(255,90,77,.12)", color: "var(--coral)", border: "1px solid rgba(255,90,77,.3)" }}
        >
          {banner}
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-muted">{t("scan.label")}</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ticket"
          className="glass rounded-xl px-3 py-2 text-sm w-full mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted">{t("form.paid")}</label>
        <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className="glass rounded-xl px-3 py-2 text-sm w-full mt-1">
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted">{t("form.category")}</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="glass rounded-xl px-3 py-2 text-sm w-full mt-1">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{t(`cat.${c.id}`)}</option>
          ))}
        </select>
      </div>

      {/* Modo: reparto por ítem (por defecto) o desactivar itemización → un
          solo monto repartido en partes iguales (se guarda como gasto normal) */}
      <div className="flex rounded-2xl overflow-hidden glass p-0.5">
        {(["items", "total"] as const).map((mo) => (
          <button
            key={mo}
            onClick={() => {
              if (mo === "total" && totalAmount === "") setTotalAmount(total ? String(total) : "");
              setMode(mo);
            }}
            className="flex-1 py-2 text-sm font-semibold rounded-xl transition-all"
            style={mode === mo ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : { color: "var(--muted)" }}
          >
            {t(mo === "items" ? "scan.byItems" : "scan.byTotal")}
          </button>
        ))}
      </div>

      {mode === "total" && (
        <>
          <div>
            <label className="text-xs font-semibold text-muted">{t("scan.totalAmount")}</label>
            <div className="glass rounded-xl px-3 py-2 flex items-center gap-1 mt-1">
              <input
                value={totalAmount}
                onChange={(e) => onTotalAmountChange(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="bg-transparent text-sm flex-1 min-w-0 font-mono"
              />
              <span className="text-muted text-[11px]">{cur}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted">{t("scan.splitAmong")}</label>
              <div className="flex gap-0.5">
                {([
                  { m: "equal", l: "=" },
                  { m: "percent", l: "%" },
                  { m: "exact", l: cur },
                  { m: "shares", l: "×" },
                ] as const).map(({ m, l }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => changeSplitMode(m)}
                    className={`px-2 py-0.5 text-xs rounded ${splitMode === m ? "surface font-bold" : "glass text-muted"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 flex-wrap mt-1">
              {members.map((m) => {
                const on = totalWho.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleTotalWho(m.id)}
                    className={`rounded-full pl-0.5 pr-2.5 py-0.5 text-xs flex items-center gap-1 border ${on ? "surface" : "glass"}`}
                    style={{ borderColor: on ? personColor(m.name) : "transparent", opacity: on ? 1 : 0.5 }}
                  >
                    <span className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: personColor(m.name) + "22" }}>
                      {memberInitials(m)}
                    </span>
                    {m.name}
                  </button>
                );
              })}
            </div>
            {/* Inputs de valor por participante (solo % / importe / partes) */}
            {splitMode !== "equal" && totalWhoIds.length > 0 && (
              <div className="mt-2 space-y-1">
                {totalWhoIds.map((id) => {
                  const m = group.members.find((x) => x.id === id);
                  if (!m) return null;
                  const val = splitVals[id] ?? 0;
                  const ts = totalWhoIds.reduce((a, x) => a + (Number(splitVals[x]) || 0), 0);
                  const implied = splitMode === "shares" && ts > 0 ? (val / ts) * total : null;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-sm flex-1 min-w-0 truncate">{m.name}</span>
                      {implied !== null && <span className="text-xs text-muted font-mono">{money(implied, group.currency)}</span>}
                      <div className="glass rounded-lg px-2 py-1 flex items-center gap-1 w-24 shrink-0">
                        <input
                          value={val === 0 ? "" : val}
                          onChange={(e) => setSplitVal(id, Number(e.target.value) || 0)}
                          inputMode="decimal"
                          placeholder="0"
                          className="bg-transparent text-sm w-full text-right font-mono"
                        />
                        <span className="text-muted text-xs">{splitMode === "percent" ? "%" : splitMode === "shares" ? "×" : cur}</span>
                      </div>
                    </div>
                  );
                })}
                {totalSplitHint && (
                  <div className={`text-xs mt-0.5 ${totalSplitValid ? "text-green-600" : "text-red-500"}`}>
                    {totalSplitValid ? `✓ ${totalSplitHint}` : totalSplitHint}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {mode === "items" && (
        <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted">{t("scan.items")}</div>
        {canToggle && (
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="glass rounded-full px-2 py-0.5 text-[10px] font-medium hover-lift text-muted inline-flex items-center gap-1 shrink-0"
          >
            <Icon name="repeat" size={11} />
            {showOriginal ? t("scan.viewConverted") : t("scan.viewOriginal", { code: originalCurrency ?? "" })}
          </button>
        )}
      </div>
      <div className="glass rounded-3xl p-3 space-y-3">
        {items.map((it, idx) => (
          <div key={it.id} className={idx < items.length - 1 ? "pb-3 border-b border-black/5" : ""}>
            <div className="flex items-center gap-2">
              <input
                value={it.name}
                onChange={(e) => setItem(it.id, { name: e.target.value })}
                placeholder="—"
                className="bg-transparent text-sm flex-1 min-w-0 px-1"
              />
              <input
                value={showOriginal ? origDisplay(it.price, it.originalPrice) : it.price}
                onChange={(e) => setItemPrice(it.id, e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={`glass rounded-lg px-1.5 py-1 text-right font-mono shrink-0 ${showOriginal ? "text-xs w-24" : "text-sm w-20"}`}
              />
              <span className="text-muted text-[11px] shrink-0">{showOriginal ? originalCurrency : cur}</span>
              <button onClick={() => splitItem(it.id)} className="lk flex items-center text-muted" title={t("scan.splitRow")}>
                <Icon name="copy" size={14} />
              </button>
              <button onClick={() => removeItem(it.id)} className="lk lk-danger flex items-center">
                <Icon name="close" size={14} />
              </button>
            </div>
            {it.qty && it.qty > 1 && (
              <button
                onClick={() => splitQty(it.id)}
                className="glass rounded-full px-2.5 py-1 text-[11px] font-medium hover-lift mt-1.5 inline-flex items-center gap-1"
                style={{ color: "var(--teal)" }}
              >
                <Icon name="copy" size={12} />
                {t("scan.splitQty", { n: String(it.qty) })}
              </button>
            )}
            <div className="flex gap-1 flex-wrap mt-2">
              {members.map((m) => {
                const on = it.who.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(it.id, m.id)}
                    className={`rounded-full pl-0.5 pr-2.5 py-0.5 text-xs flex items-center gap-1 border ${on ? "surface" : "glass"}`}
                    style={{ borderColor: on ? personColor(m.name) : "transparent", opacity: on ? 1 : 0.5 }}
                  >
                    <span className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: personColor(m.name) + "22" }}>
                      {memberInitials(m)}
                    </span>
                    {m.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={() => selectAll(it.id)} className="lk text-[11px] text-muted">{t("scan.selectAll")}</button>
              <button onClick={() => deselectAll(it.id)} className="lk text-[11px] text-muted">{t("scan.deselectAll")}</button>
            </div>
          </div>
        ))}
        <button onClick={addItem} className="lk text-sm inline-flex items-center gap-1">
          <Icon name="plus" size={13} /> {t("scan.addItem")}
        </button>
      </div>

      {/* Recargos: proporcional al consumo */}
      <div className="glass rounded-3xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted">{t("scan.fees")}</div>
          <button onClick={addFee} className="lk text-xs inline-flex items-center gap-1">
            <Icon name="plus" size={12} /> {t("scan.addFee")}
          </button>
        </div>
        {fees.length === 0 ? (
          <div className="text-[11px] text-muted">{t("scan.feesNote")}</div>
        ) : (
          fees.map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              <input
                value={f.name}
                onChange={(e) => setFee(f.id, { name: e.target.value })}
                placeholder={t("scan.feeName")}
                className="bg-transparent text-sm flex-1 min-w-0 px-1"
              />
              <input
                value={showOriginal ? origDisplay(f.amount, f.originalAmount) : f.amount}
                onChange={(e) => setFeeAmount(f.id, e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={`glass rounded-lg px-1.5 py-1 text-right font-mono shrink-0 ${showOriginal ? "text-xs w-24" : "text-sm w-20"}`}
              />
              <span className="text-muted text-[11px] shrink-0">{showOriginal ? originalCurrency : cur}</span>
              <button onClick={() => removeFee(f.id)} className="lk lk-danger flex items-center">
                <Icon name="close" size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {(category === "comida" || category === "bebidas") && (
        <div className="glass rounded-3xl p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{t("scan.tip")}</div>
            <div className="text-[11px] text-muted">{t("scan.tipNote")}</div>
          </div>
          <div className="flex items-center gap-1">
            <input
              value={tipDisplay}
              onChange={(e) => onTipChange(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={`glass rounded-lg px-1.5 py-1 text-right font-mono shrink-0 ${showOriginal ? "text-xs w-24" : "text-sm w-20"}`}
            />
            <span className="text-muted text-[11px] shrink-0">{showOriginal ? originalCurrency : cur}</span>
          </div>
        </div>
      )}

      {Math.abs(feesTotal) > 0.001 && (
        <div className="glass rounded-3xl p-3 flex items-center justify-between">
          <span className="text-sm text-muted">{t("scan.subtotal")}</span>
          <span className="font-mono text-muted">
            {showOriginal && canToggle ? money(originalItemsTotal, originalCurrency) : money(itemsTotal, group.currency)}
          </span>
        </div>
      )}
        </>
      )}

      {/* Descuadre: la suma de los ítems no coincide con el total impreso en
          el ticket → probablemente el escaneo leyó mal un precio. */}
      {!isTotalMode && scannedTotal != null && scannedTotal > 0 && Math.abs(total - scannedTotal) > 0.02 && (
        <div
          className="rounded-2xl px-4 py-3 text-xs"
          style={{ background: "rgba(232,146,12,.12)", color: "var(--amber)", border: "1px solid rgba(232,146,12,.3)" }}
        >
          {t("scan.totalMismatch", { scanned: money(scannedTotal, group.currency), sum: money(total, group.currency) })}
        </div>
      )}

      <div className="glass rounded-3xl p-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{t("scan.total")}</span>
        <span className="font-mono font-bold text-lg">
          {showOriginal && canToggle ? money(originalTotal, originalCurrency) : money(total, group.currency)}
        </span>
      </div>

      <div className="glass rounded-3xl p-3">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm py-0.5">
            <span>{m.name}</span>
            {showOriginal && canToggle ? (
              <span className="font-mono font-bold text-right">
                {money(splits[m.id] || 0, group.currency)}
                <span className="block text-[11px] font-normal text-muted">
                  {money((splits[m.id] || 0) / fxRate!, originalCurrency)}
                </span>
              </span>
            ) : (
              <span className="font-mono font-bold">{money(splits[m.id] || 0, group.currency)}</span>
            )}
          </div>
        ))}
      </div>

      {taxInfo && (
        <div className="text-[11px] text-muted">
          {t("scan.taxIncluded", {
            rate: String(taxInfo.rate || 0),
            amt:
              showOriginal && canToggle && taxInfo.originalAmount != null
                ? money(taxInfo.originalAmount, originalCurrency)
                : money(taxInfo.amount, group.currency),
          })}
        </div>
      )}

      {/* Permitir edición a otros participantes (por defecto, solo el creador puede editar) */}
      <button
        type="button"
        onClick={() => setAllowEdits((v) => !v)}
        className="w-full flex items-center justify-between gap-2 glass rounded-xl px-3 py-2.5 text-left"
      >
        <span className="text-sm">{t("form.allowEdits")}</span>
        <span
          className="h-5 w-9 rounded-full relative shrink-0 transition-colors"
          style={{ background: allowEdits ? "var(--teal)" : "var(--line)" }}
        >
          <span
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: allowEdits ? "translateX(18px)" : "translateX(2px)" }}
          />
        </span>
      </button>

      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting || !canSubmit} className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-50">
          {submitting ? t("scan.saving") : submitLabel}
        </button>
        <button onClick={onCancel} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">{t("common.cancel")}</button>
      </div>
    </div>
  );
}
