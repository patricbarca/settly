import React, { useState, useEffect } from "react";
import type { Category, Group } from "../lib/types";
import type { SplitMode } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { personColor, money, sortedMembers } from "../lib/format";
import { Avatar } from "./Avatar";
import { currencySymbol } from "../lib/currencies";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

export type { SplitMode };

export interface ExpenseDraft {
  label: string;
  amount: number | string;
  payerId: string;
  multiPay: boolean;
  payments: Record<string, number>;      // memberId -> amount paid (form state)
  participantIds: string[];
  splitMode: SplitMode;
  splitValues: Record<string, number>;   // %, exact amounts, or share counts
  category: Category;
  /** Si true, cualquier participante puede editar este gasto (no solo el creador). */
  allowEdits?: boolean;
}

/** Initialize splitValues for a given mode, participant list, and total amount */
function initSplitValues(
  mode: SplitMode,
  participantIds: string[],
  totalAmt: number
): Record<string, number> {
  const n = participantIds.length;
  if (n === 0) return {};
  const vals: Record<string, number> = {};
  if (mode === "percent") {
    const base = Math.floor(100 / n);
    const rem = 100 - base * n;
    participantIds.forEach((id, i) => {
      vals[id] = base + (i === n - 1 ? rem : 0);
    });
  } else if (mode === "exact") {
    const base = Math.floor((totalAmt / n) * 100) / 100;
    const rem = Math.round((totalAmt - base * n) * 100) / 100;
    participantIds.forEach((id, i) => {
      vals[id] = base + (i === n - 1 ? rem : 0);
    });
  } else if (mode === "shares") {
    participantIds.forEach((id) => { vals[id] = 1; });
  }
  return vals;
}

/** Convert a draft to final expense fields */
export function draftToExpenseFields(d: ExpenseDraft): {
  payerId: string;
  // `null` (no `undefined`) cuando NO hay multi-pago, para que el patch al
  // servidor incluya la clave y limpie los pagadores anteriores (un `undefined`
  // se pierde en JSON.stringify y el merge JSONB conservaría el valor viejo).
  payments: { memberId: string; amount: number }[] | null;
  splits: Record<string, number> | null;
} {
  const totalAmt = Number(d.amount) || 0;

  // Payments
  let payerId = d.payerId;
  let payments: { memberId: string; amount: number }[] | null = null;
  if (d.multiPay) {
    const arr = Object.entries(d.payments)
      .filter(([, amt]) => amt > 0)
      .map(([memberId, amount]) => ({ memberId, amount }));
    payments = arr.length ? arr : null;
    if (arr.length > 0) {
      // primary payer = who paid most
      const top = arr.reduce((a, b) => (b.amount > a.amount ? b : a));
      payerId = top.memberId;
    }
  }

  // Splits
  let splits: Record<string, number> | null = null;
  if (d.splitMode === "equal") {
    splits = null;
  } else if (d.splitMode === "exact") {
    splits = { ...d.splitValues };
  } else if (d.splitMode === "percent") {
    const result: Record<string, number> = {};
    for (const id of d.participantIds) {
      const pct = d.splitValues[id] ?? 0;
      result[id] = Math.round((pct / 100) * totalAmt * 100) / 100;
    }
    splits = result;
  } else if (d.splitMode === "shares") {
    const totalShares = d.participantIds.reduce((sum, id) => sum + (d.splitValues[id] ?? 0), 0);
    const result: Record<string, number> = {};
    for (const id of d.participantIds) {
      const sh = d.splitValues[id] ?? 0;
      result[id] = totalShares > 0 ? Math.round((sh / totalShares) * totalAmt * 100) / 100 : 0;
    }
    splits = result;
  }

  return { payerId, payments, splits };
}

export function ExpenseForm({
  group,
  initial,
  onSave,
  onCancel,
  submitLabel,
  children,
  amountCurrency,
}: {
  group: Group;
  initial: ExpenseDraft;
  onSave: (d: ExpenseDraft) => void;
  onCancel: () => void;
  submitLabel?: string;
  children?: React.ReactNode;
  /** Moneda en la que se está tecleando el monto, si distinta a la del grupo
   *  (selector manual de moneda). Solo cambia símbolos/formato mostrados; la
   *  conversión real a la moneda del grupo ocurre al guardar. */
  amountCurrency?: string;
}) {
  const t = useT();
  const currencyCode = amountCurrency || group.currency;
  const sym = currencySymbol(currencyCode);
  const [f, setF] = useState<ExpenseDraft>(initial);
  const up = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const amt = Number(f.amount) || 0;

  // Toggle participant (for equal mode) or toggle+reinit for non-equal
  function toggleParticipant(id: string) {
    setF((s) => {
      const isOn = s.participantIds.includes(id);
      const newIds = isOn
        ? s.participantIds.filter((x) => x !== id)
        : [...s.participantIds, id];
      const newSplitValues =
        s.splitMode === "equal"
          ? s.splitValues
          : initSplitValues(s.splitMode, newIds, Number(s.amount) || 0);
      return { ...s, participantIds: newIds, splitValues: newSplitValues };
    });
  }

  // When splitMode changes, reinitialize splitValues
  function changeSplitMode(mode: SplitMode) {
    setF((s) => ({
      ...s,
      splitMode: mode,
      splitValues: initSplitValues(mode, s.participantIds, Number(s.amount) || 0),
    }));
  }

  // When amount changes in non-equal mode, reinitialize
  function changeAmount(val: string) {
    setF((s) => {
      const newAmt = Number(val) || 0;
      const needsReinit = s.splitMode === "exact" || s.splitMode === "percent";
      return {
        ...s,
        amount: val,
        splitValues: needsReinit
          ? initSplitValues(s.splitMode, s.participantIds, newAmt)
          : s.splitValues,
      };
    });
  }

  // Update a single splitValue. En modos "exact"/"percent", al editar a
  // cualquiera que NO sea el último participante, el último se autocompleta con
  // el resto (total − suma de los demás), para no tener que calcularlo a mano.
  // Editar directamente el último lo respeta (permite sobrescribir).
  function setSplitValue(id: string, val: number) {
    setF((s) => {
      const next = { ...s.splitValues, [id]: val };
      if ((s.splitMode === "exact" || s.splitMode === "percent") && s.participantIds.length >= 2) {
        const lastId = s.participantIds[s.participantIds.length - 1];
        if (id !== lastId) {
          const total = s.splitMode === "percent" ? 100 : Number(s.amount) || 0;
          const others = s.participantIds
            .filter((x) => x !== lastId)
            .reduce((a, x) => a + (Number(next[x]) || 0), 0);
          const rem = Math.round((total - others) * 100) / 100;
          next[lastId] = rem > 0 ? rem : 0;
        }
      }
      return { ...s, splitValues: next };
    });
  }

  // Update a payment amount
  function setPaymentAmt(memberId: string, val: number) {
    setF((s) => ({ ...s, payments: { ...s.payments, [memberId]: val } }));
  }

  // Validation
  const paymentSum = f.multiPay
    ? Object.values(f.payments).reduce((a, b) => a + (Number(b) || 0), 0)
    : amt;
  const paymentValid = !f.multiPay || Math.abs(paymentSum - amt) < 0.01;

  const per = f.participantIds.length ? amt / f.participantIds.length : 0;

  let splitValid = false;
  let splitSumDisplay: string | null = null;
  if (f.splitMode === "equal") {
    splitValid = f.participantIds.length > 0;
  } else if (f.splitMode === "percent") {
    const sum = f.participantIds.reduce((a, id) => a + (f.splitValues[id] ?? 0), 0);
    splitValid = Math.abs(sum - 100) < 0.5;
    splitSumDisplay = sum.toFixed(1) + "%";
  } else if (f.splitMode === "exact") {
    const sum = f.participantIds.reduce((a, id) => a + (f.splitValues[id] ?? 0), 0);
    splitValid = Math.abs(sum - amt) < 0.01;
    splitSumDisplay = money(sum, currencyCode);
  } else if (f.splitMode === "shares") {
    splitValid = f.participantIds.length > 0;
  }

  const valid =
    String(f.label).trim() &&
    amt > 0 &&
    f.participantIds.length > 0 &&
    paymentValid &&
    splitValid;

  function save() {
    if (!valid) return;
    onSave({ ...f, amount: amt });
  }

  const members = sortedMembers(group.members);

  const modeTabs: { mode: SplitMode; label: string }[] = [
    { mode: "equal", label: "=" },
    { mode: "percent", label: "%" },
    { mode: "exact", label: sym },
    { mode: "shares", label: "×" },
  ];

  return (
    <div className="space-y-3">
      {/* Label + Amount */}
      <div className="flex gap-2">
        <input
          value={f.label}
          onChange={(e) => up("label", e.target.value)}
          placeholder={t("form.concept")}
          className="glass rounded-xl px-3 py-2.5 text-sm flex-1 min-w-0"
        />
        <div className="glass rounded-xl px-3 py-2.5 flex items-center gap-1 w-28 shrink-0">
          <input
            value={f.amount}
            onChange={(e) => changeAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="bg-transparent text-sm w-full text-right font-mono"
          />
          <span className="text-muted text-sm">{sym}</span>
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-xs font-semibold text-muted">{t("form.category")}</label>
        <div className="flex gap-1.5 flex-wrap mt-1">
          {CATEGORIES.map((c) => {
            const on = f.category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => up("category", c.id)}
                className={`rounded-full px-3 py-1 text-sm inline-flex items-center gap-1.5 ${on ? "" : "glass text-muted"}`}
                style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
              >
                <Icon name={c.icon} size={15} /> {t(`cat.${c.id}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Who paid */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted">{t("form.paid")}</label>
          <button
            type="button"
            onClick={() => up("multiPay", !f.multiPay)}
            className="text-xs text-muted underline"
          >
            {f.multiPay ? t("form.singlePay") : t("form.multiPay")}
          </button>
        </div>

        {!f.multiPay ? (
          <div className="flex gap-1.5 flex-wrap mt-1">
            {members.map((m) => {
              const on = f.payerId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => up("payerId", m.id)}
                  className={`rounded-full pl-1 pr-3 py-1 text-sm flex items-center gap-1.5 border ${on ? "surface font-semibold" : "glass text-muted"}`}
                  style={{ borderColor: on ? personColor(m.name) : "transparent" }}
                >
                  <Avatar name={m.name} avatar={m.avatar} size={24} />
                  {m.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-1 space-y-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Avatar name={m.name} avatar={m.avatar} size={24} />
                <span className="text-sm flex-1 min-w-0 truncate">{m.name}</span>
                <div className="glass rounded-lg px-2 py-1 flex items-center gap-1 w-28 shrink-0">
                  <input
                    value={f.payments[m.id] ?? ""}
                    onChange={(e) => setPaymentAmt(m.id, Number(e.target.value) || 0)}
                    inputMode="decimal"
                    placeholder="0"
                    className="bg-transparent text-sm w-full text-right font-mono"
                  />
                  <span className="text-muted text-xs">{sym}</span>
                </div>
              </div>
            ))}
            {/* Payment status line */}
            <div className={`text-xs mt-1 ${paymentValid ? "text-green-600" : "text-red-500"}`}>
              {paymentValid
                ? `✓ ${t("form.paymentOk")}`
                : paymentSum < amt
                ? t("form.remaining", { amt: money(amt - paymentSum, currencyCode) })
                : t("form.over", { amt: money(paymentSum - amt, currencyCode) })}
            </div>
          </div>
        )}
      </div>

      {/* Split between */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted">
            {t("form.between")}{" "}
            {f.splitMode === "equal" && f.participantIds.length > 0 && (
              <span className="font-normal">
                · {money(per, currencyCode)} {t("form.each")}
              </span>
            )}
          </label>
          {/* Mode tabs */}
          <div className="flex gap-0.5">
            {modeTabs.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeSplitMode(mode)}
                className={`px-2 py-0.5 text-xs rounded ${
                  f.splitMode === mode
                    ? "surface font-bold"
                    : "glass text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Participant pill toggles */}
        <div className="flex gap-1.5 flex-wrap mt-1">
          {members.map((m) => {
            const on = f.participantIds.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleParticipant(m.id)}
                className={`rounded-full pl-1 pr-3 py-1 text-sm flex items-center gap-1.5 border ${on ? "surface" : "glass"}`}
                style={{ borderColor: on ? personColor(m.name) : "transparent", opacity: on ? 1 : 0.5 }}
              >
                <Avatar name={m.name} avatar={m.avatar} size={24} />
                {m.name}
              </button>
            );
          })}
        </div>

        {/* Value inputs for non-equal modes */}
        {f.splitMode !== "equal" && f.participantIds.length > 0 && (
          <div className="mt-2 space-y-1">
            {f.participantIds.map((id) => {
              const member = group.members.find((m) => m.id === id);
              if (!member) return null;
              const val = f.splitValues[id] ?? 0;
              const totalShares = f.participantIds.reduce(
                (s, pid) => s + (f.splitValues[pid] ?? 0),
                0
              );
              const impliedAmt =
                f.splitMode === "shares" && totalShares > 0
                  ? (val / totalShares) * amt
                  : null;
              return (
                <div key={id} className="flex items-center gap-2">
                  <Avatar name={member.name} avatar={member.avatar} size={20} />
                  <span className="text-sm flex-1 min-w-0 truncate">{member.name}</span>
                  {f.splitMode === "shares" && impliedAmt !== null && (
                    <span className="text-xs text-muted font-mono">
                      {money(impliedAmt, currencyCode)}
                    </span>
                  )}
                  <div className="glass rounded-lg px-2 py-1 flex items-center gap-1 w-28 shrink-0">
                    <input
                      value={val === 0 ? "" : val}
                      onChange={(e) => setSplitValue(id, Number(e.target.value) || 0)}
                      inputMode="decimal"
                      placeholder="0"
                      className="bg-transparent text-sm w-full text-right font-mono"
                    />
                    <span className="text-muted text-xs">
                      {f.splitMode === "percent" ? "%" : f.splitMode === "shares" ? "×" : sym}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Validation indicator */}
            <div className={`text-xs mt-0.5 ${splitValid ? "text-green-600" : "text-red-500"}`}>
              {splitValid
                ? `✓ ${t("form.paymentOk")}`
                : f.splitMode === "percent"
                ? t("form.sumMustBe100")
                : f.splitMode === "exact"
                ? splitSumDisplay !== null
                  ? t("form.remaining", {
                      amt: money(amt - f.participantIds.reduce((a, pid) => a + (f.splitValues[pid] ?? 0), 0), currencyCode),
                    })
                  : ""
                : ""}
            </div>
          </div>
        )}
      </div>

      {/* Permitir edición a otros participantes (por defecto, solo el creador puede editar) */}
      <button
        type="button"
        onClick={() => up("allowEdits", !f.allowEdits)}
        className="w-full flex items-center justify-between gap-2 glass rounded-xl px-3 py-2.5 text-left"
      >
        <span className="text-sm">{t("form.allowEdits")}</span>
        <span
          className="h-5 w-9 rounded-full relative shrink-0 transition-colors"
          style={{ background: f.allowEdits ? "var(--teal)" : "var(--line)" }}
        >
          <span
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: f.allowEdits ? "translateX(18px)" : "translateX(2px)" }}
          />
        </span>
      </button>

      {children}

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={!valid}
          className="glass-strong rounded-full px-5 py-2.5 font-medium hover-lift disabled:opacity-50"
        >
          {submitLabel ?? t("common.save")}
        </button>
        <button onClick={onCancel} className="glass rounded-full px-5 py-2.5 hover-lift text-muted">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
