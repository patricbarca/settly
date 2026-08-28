import { useState } from "react";
import type { Group } from "../lib/types";
import { memberPays } from "../lib/pay";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

/** Recordatorio al inicio del grupo: si TÚ (tu miembro) todavía no tienes un
 *  método de cobro configurado, muestra un aviso con un botón que abre tu perfil
 *  para completarlo — así los demás pueden pagarte con un tap. Se puede descartar
 *  (persistido en localStorage por usuario) para no insistir. */
export function PayMethodReminder({ group }: { group: Group }) {
  const t = useT();
  const key = `settlia.payMethodReminderDismissed.${group.meId ?? "?"}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });

  const me = group.members.find((m) => m.id === group.meId);
  const hasPay = memberPays(me).length > 0;
  if (hasPay || dismissed || !me) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      className="rounded-2xl p-3.5 mb-3 flex items-start gap-3"
      style={{ background: "rgba(15,163,163,0.10)", border: "1px solid rgba(15,163,163,0.25)" }}
    >
      <span
        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgba(15,163,163,0.16)", color: "var(--teal)" }}
      >
        <Icon name="card" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{t("payReminder.title")}</div>
        <div className="text-xs text-muted mt-0.5 leading-snug">{t("payReminder.body")}</div>
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => window.dispatchEvent(new Event("settlia:open-profile"))}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white hover-lift"
            style={{ background: "var(--teal)" }}
          >
            {t("payReminder.cta")}
          </button>
          <button onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs text-muted hover-lift">
            {t("payReminder.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
