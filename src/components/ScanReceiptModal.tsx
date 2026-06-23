import { useState, type ChangeEvent } from "react";
import type { Group, Category } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { scanReceipt } from "../lib/ai";
import { updateGroup } from "../lib/store";
import { withNotif } from "../lib/notifications";
import { withActivity } from "../lib/activity";
import { notifyGroup } from "../lib/push";
import { uid, money, personColor, memberInitials } from "../lib/format";
import { currencySymbol } from "../lib/currencies";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

type Item = { id: string; name: string; price: number | string; who: Set<string> };

export function ScanReceiptModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const allIds = group.members.map((m) => m.id);
  const [stage, setStage] = useState<"pick" | "analyzing" | "review">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [scanError, setScanError] = useState(false);
  const [tip, setTip] = useState<number | string>("");
  const [payerId, setPayerId] = useState(group.meId);
  const [category, setCategory] = useState<Category>("comida");

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setPreview(String(reader.result));
      setStage("analyzing");
      setScanError(false);
      // Lectura real con un modelo de visión (Edge Function `scan-receipt`).
      // Si falla, avisamos y dejamos una fila vacía para añadir a mano (sin
      // datos de ejemplo, que confundían al parecer un ticket real).
      try {
        const res = await scanReceipt(file);
        const rows = res.items.length
          ? res.items.map((s) => ({ id: uid(), name: s.name, price: s.price, who: new Set(allIds) }))
          : [{ id: uid(), name: "", price: "" as number | string, who: new Set(allIds) }];
        setItems(rows);
      } catch {
        setScanError(true);
        setItems([{ id: uid(), name: "", price: "" as number | string, who: new Set(allIds) }]);
      }
      setStage("review");
    };
    reader.readAsDataURL(file);
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
  const setItem = (itemId: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((arr) => [...arr, { id: uid(), name: "", price: "", who: new Set(allIds) }]);
  const removeItem = (itemId: string) => setItems((arr) => arr.filter((it) => it.id !== itemId));

  const itemsTotal = items.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const tipNum = Number(tip) || 0;
  const total = itemsTotal + tipNum;
  const splits: Record<string, number> = {};
  allIds.forEach((id) => (splits[id] = 0));
  items.forEach((it) => {
    const who = [...it.who];
    if (!who.length) return;
    const per = (Number(it.price) || 0) / who.length;
    who.forEach((id) => (splits[id] += per));
  });
  // La propina se reparte solo entre quienes consumieron algo del ticket.
  const itemParticipants = allIds.filter((id) => splits[id] > 0.001);
  if (tipNum > 0 && itemParticipants.length) {
    const perTip = tipNum / itemParticipants.length;
    itemParticipants.forEach((id) => (splits[id] += perTip));
  }
  const participants = allIds.filter((id) => splits[id] > 0.001);

  function save() {
    if (total <= 0 || participants.length === 0) return;
    const rounded: Record<string, number> = {};
    allIds.forEach((id) => (rounded[id] = Math.round(splits[id] * 100) / 100));
    const meName = group.members.find((m) => m.id === group.meId)?.name ?? "?";
    updateGroup(group.id, (g) => ({
      ...g,
      expenses: [
        {
          id: uid(),
          label: "Ticket",
          amount: Math.round(total * 100) / 100,
          payerId,
          participantIds: participants,
          category,
          date: new Date().toISOString().slice(0, 10),
          splits: rounded,
          createdBy: group.meId,
        },
        ...g.expenses,
      ],
      notifications: withNotif(g, {
        type: "expense_added",
        actorId: group.meId,
        actorName: meName,
        label: "Ticket",
        amount: Math.round(total * 100) / 100,
      }),
      activity: withActivity(g, {
        type: "scan_used",
        actorId: group.meId,
        actorName: meName,
        label: "Ticket",
        amount: Math.round(total * 100) / 100,
      }),
    }));
    notifyGroup(
      group.id,
      group.name,
      t("notif.expense_added", { name: meName, label: "Ticket", amt: money(Math.round(total * 100) / 100, group.currency) })
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
          <div className="space-y-3">
            {scanError && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{ background: "rgba(255,90,77,.12)", color: "var(--coral)", border: "1px solid rgba(255,90,77,.3)" }}
              >
                {t("scan.error")}
              </div>
            )}
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
                    <span className="text-muted text-sm">{currencySymbol(group.currency)}</span>
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
                <span className="text-muted text-sm">{currencySymbol(group.currency)}</span>
              </div>
            </div>

            <div className="glass rounded-3xl p-3">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm py-0.5">
                  <span>{m.name}</span>
                  <span className="font-mono font-bold">{money(splits[m.id] || 0, group.currency)}</span>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted">{t("scan.total")}: {money(total, group.currency)}</div>
            <p className="text-[11px] text-muted leading-relaxed">{t("scan.aiNote")}</p>

            <div className="flex gap-2">
              <button onClick={save} className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift">{t("scan.save")}</button>
              <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">{t("common.cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}
