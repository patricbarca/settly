import { useState } from "react";
import { useTrialDaysLeft, startPortal } from "../lib/plan";
import { useT } from "../lib/i18n";

export function TrialBanner() {
  const t = useT();
  const daysLeft = useTrialDaysLeft();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (daysLeft === null) return null;

  async function handlePortal() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const error = await startPortal();
    if (error) {
      setBusy(false);
      setErr(t("trial.manageError"));
    }
  }

  return (
    <div
      className="mx-4 mb-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: "rgba(232,146,12,0.12)", border: "1px solid rgba(232,146,12,0.25)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--amber)" }}>
        {t("trial.daysLeft").replace("{n}", String(daysLeft))}
      </p>
      <button
        onClick={handlePortal}
        disabled={busy}
        className="text-xs font-semibold shrink-0 disabled:opacity-50"
        style={{ color: "var(--amber)" }}
      >
        {busy ? "…" : t("trial.manage")}
      </button>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}
