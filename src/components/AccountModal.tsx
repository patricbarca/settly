import { useState } from "react";
import type { PayType, PayMethod } from "../lib/types";
import { useUser, setProfileName } from "../lib/auth";
import { useGroups, updateMyMember } from "../lib/store";
import { personColor, initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { usePlan, FREE_AI_QUOTA } from "../lib/plan";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { Paywall } from "./Paywall";

const PAY_TYPES: PayType[] = ["payid", "bank", "paypal", "revolut", "wise", "bizum", "bunq", "other"];

export function AccountModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const user = useUser();
  const groups = useGroups();
  const plan = usePlan();
  const [showPaywall, setShowPaywall] = useState(false);

  const myMember = groups.map((g) => g.members.find((m) => m.id === g.meId)).find(Boolean);

  const [name, setName] = useState(user?.name ?? "");
  const [payType, setPayType] = useState<PayType>(myMember?.pay?.type ?? "other");
  const [payValue, setPayValue] = useState(myMember?.pay?.value ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  async function save() {
    if (saving) return;
    setSaving(true);
    const n = name.trim();
    if (n && n !== user!.name) {
      await setProfileName(n);
      updateMyMember({ name: n });
    }
    const pay: PayMethod | undefined = payValue.trim()
      ? { type: payType, value: payValue.trim() }
      : undefined;
    updateMyMember({ pay });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">{t("account.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex justify-center mb-5">
          <span
            className="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: personColor(name || user.name) + "22" }}
          >
            {initials(name || user.name)}
          </span>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("account.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          />
        </div>

        {/* Email read-only */}
        {user.email && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-muted mb-1">{t("login.email")}</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
        )}

        {/* Subscription */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("pro.section")}</label>
          <div className="glass rounded-xl p-3 mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: plan === "pro" ? "rgba(91,91,240,0.15)" : "var(--glass)",
                  color: plan === "pro" ? "var(--indigo)" : "var(--muted)",
                }}
              >
                <Icon name="sparkles" size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {plan === "pro" ? t("pro.planPro") : t("pro.planFree")}
                </div>
                <div className="text-xs text-muted truncate">
                  {plan === "pro" ? t("pro.proHint") : t("pro.freeHint", { n: FREE_AI_QUOTA })}
                </div>
              </div>
            </div>
            {plan === "free" ? (
              <button
                onClick={() => setShowPaywall(true)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white shrink-0 hover-lift"
                style={{ background: "var(--indigo)" }}
              >
                {t("pro.upgrade")}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold shrink-0"
                style={{ color: "var(--indigo)" }}
              >
                <Icon name="check" size={14} /> {t("pro.active")}
              </span>
            )}
          </div>
        </div>

        {/* Payment method */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted">{t("pay.methods")}</label>
          <p className="text-xs text-muted mt-0.5 mb-2">{t("account.payHint")}</p>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {PAY_TYPES.map((pt) => {
              const on = payType === pt;
              return (
                <button
                  key={pt}
                  onClick={() => setPayType(pt)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${on ? "" : "glass text-muted"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {t(`pay.label.${pt}`)}
                </button>
              );
            })}
          </div>
          <input
            value={payValue}
            onChange={(e) => setPayValue(e.target.value)}
            placeholder={t(`pay.ph.${payType}`)}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full"
          />
        </div>

        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full rounded-full py-3 font-semibold text-white hover-lift disabled:opacity-40"
          style={{ background: saved ? "#0A8B5E" : "var(--ink)" }}
        >
          {saved ? `✓ ${t("account.saved")}` : saving ? "…" : t("common.save")}
        </button>

        {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
      </div>
    </Overlay>
  );
}
