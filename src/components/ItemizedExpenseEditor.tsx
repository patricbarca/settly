import { useState } from "react";
import type { Group, Category, ExpenseItem } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import type { ScanTax } from "../lib/ai";
import { uid, money, personColor, memberInitials } from "../lib/format";
import { currencySymbol } from "../lib/currencies";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

type Item = { id: string; name: string; price: number | string; who: Set<string> };
type Fee = { id: string; name: string; amount: number | string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ItemizedResult = {
  label: string;
  amount: number;
  payerId: string;
  participantIds: string[];
  category: Category;
  splits: Record<string, number>;
  items: ExpenseItem[];
  fees: { name: string; amount: number }[];
  tip: number;
};

export type ItemizedInitial = {
  label?: string;
  items?: ExpenseItem[];
  fees?: { name: string; amount: number }[];
  tip?: number;
  payerId?: string;
  category?: Category;
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
  submitting,
  onSubmit,
  onCancel,
}: {
  group: Group;
  initial: ItemizedInitial;
  submitLabel: string;
  banner?: string;
  taxInfo?: ScanTax | null;
  submitting?: boolean;
  onSubmit: (r: ItemizedResult) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const allIds = group.members.map((m) => m.id);
  const cur = currencySymbol(group.currency);

  const [label, setLabel] = useState(initial.label ?? "");
  const [category, setCategory] = useState<Category>(initial.category ?? "comida");
  const [payerId, setPayerId] = useState(initial.payerId ?? group.meId);
  const [tip, setTip] = useState<number | string>(initial.tip ? String(initial.tip) : "");
  const [items, setItems] = useState<Item[]>(() =>
    (initial.items?.length ? initial.items : [{ name: "", price: 0, participantIds: allIds }]).map((it) => ({
      id: uid(),
      name: it.name,
      price: it.price || "",
      who: new Set(it.participantIds?.length ? it.participantIds : allIds),
    }))
  );
  const [fees, setFees] = useState<Fee[]>(() =>
    (initial.fees ?? []).map((f) => ({ id: uid(), name: f.name, amount: f.amount }))
  );

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
  const addItem = () => setItems((arr) => [...arr, { id: uid(), name: "", price: "", who: new Set(allIds) }]);
  const removeItem = (id: string) => setItems((arr) => arr.filter((it) => it.id !== id));
  function splitItem(id: string) {
    setItems((arr) => {
      const idx = arr.findIndex((it) => it.id === id);
      if (idx < 0) return arr;
      const it = arr[idx];
      const p = Number(it.price) || 0;
      const half = r2(p / 2);
      const a: Item = { ...it, id: uid(), price: half, who: new Set(it.who) };
      const b: Item = { ...it, id: uid(), price: r2(p - half), who: new Set(it.who) };
      return [...arr.slice(0, idx), a, b, ...arr.slice(idx + 1)];
    });
  }
  const setFee = (id: string, patch: Partial<Fee>) =>
    setFees((arr) => arr.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const addFee = () => setFees((arr) => [...arr, { id: uid(), name: "", amount: "" }]);
  const removeFee = (id: string) => setFees((arr) => arr.filter((f) => f.id !== id));

  // --- Reparto ---
  const itemsTotal = items.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const feesTotal = fees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const tipNum = Number(tip) || 0;
  const total = r2(itemsTotal + feesTotal + tipNum);

  const splits: Record<string, number> = {};
  allIds.forEach((id) => (splits[id] = 0));
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
  const participants = allIds.filter((id) => splits[id] > 0.001);

  function submit() {
    if (total <= 0 || participants.length === 0) return;
    const rounded: Record<string, number> = {};
    allIds.forEach((id) => (rounded[id] = r2(splits[id])));
    onSubmit({
      label: label.trim() || "Ticket",
      amount: total,
      payerId,
      participantIds: participants,
      category,
      splits: rounded,
      items: items
        .filter((it) => (Number(it.price) || 0) > 0 || it.name.trim())
        .map((it) => ({ name: it.name.trim(), price: Number(it.price) || 0, participantIds: [...it.who] })),
      fees: fees
        .filter((f) => Math.abs(Number(f.amount) || 0) > 0.0001)
        .map((f) => ({ name: f.name.trim(), amount: Number(f.amount) || 0 })),
      tip: tipNum,
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

      <div className="text-xs font-semibold text-muted">{t("scan.items")}</div>
      <div className="glass rounded-3xl p-3 space-y-3">
        {items.map((it, idx) => (
          <div key={it.id} className={idx < items.length - 1 ? "pb-3 border-b border-black/5" : ""}>
            <div className="flex items-center gap-2">
              <input
                value={it.name}
                onChange={(e) => setItem(it.id, { name: e.target.value })}
                placeholder="—"
                className="bg-transparent text-sm flex-1 px-1"
              />
              <input
                value={it.price}
                onChange={(e) => setItem(it.id, { price: e.target.value })}
                inputMode="decimal"
                placeholder="0"
                className="glass rounded-lg px-2 py-1 text-sm w-20 text-right font-mono"
              />
              <span className="text-muted text-sm">{cur}</span>
              <button onClick={() => splitItem(it.id)} className="lk flex items-center text-muted" title={t("scan.splitRow")}>
                <Icon name="copy" size={14} />
              </button>
              <button onClick={() => removeItem(it.id)} className="lk lk-danger flex items-center">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="flex gap-1 flex-wrap mt-2">
              {group.members.map((m) => {
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
                className="bg-transparent text-sm flex-1 px-1"
              />
              <input
                value={f.amount}
                onChange={(e) => setFee(f.id, { amount: e.target.value })}
                inputMode="decimal"
                placeholder="0"
                className="glass rounded-lg px-2 py-1 text-sm w-20 text-right font-mono"
              />
              <span className="text-muted text-sm">{cur}</span>
              <button onClick={() => removeFee(f.id)} className="lk lk-danger flex items-center">
                <Icon name="close" size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-muted">{t("form.paid")}</label>
          <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className="glass rounded-xl px-3 py-2 text-sm w-full mt-1">
            {group.members.map((m) => (
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
      </div>

      {category === "comida" && (
        <div className="glass rounded-3xl p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{t("scan.tip")}</div>
            <div className="text-[11px] text-muted">{t("scan.tipNote")}</div>
          </div>
          <div className="flex items-center gap-1">
            <input
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="glass rounded-lg px-2 py-1 text-sm w-20 text-right font-mono"
            />
            <span className="text-muted text-sm">{cur}</span>
          </div>
        </div>
      )}

      <div className="glass rounded-3xl p-3">
        {group.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm py-0.5">
            <span>{m.name}</span>
            <span className="font-mono font-bold">{money(splits[m.id] || 0, group.currency)}</span>
          </div>
        ))}
      </div>

      {taxInfo && (
        <div className="text-[11px] text-muted">
          {t("scan.taxIncluded", { rate: String(taxInfo.rate || 0), amt: money(taxInfo.amount, group.currency) })}
        </div>
      )}
      <div className="text-xs text-muted">{t("scan.total")}: {money(total, group.currency)}</div>

      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting} className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-50">
          {submitting ? t("scan.saving") : submitLabel}
        </button>
        <button onClick={onCancel} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">{t("common.cancel")}</button>
      </div>
    </div>
  );
}
