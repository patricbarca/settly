import { useState } from "react";
import { useT } from "../lib/i18n";
import { Overlay } from "./Overlay";
import { Icon, type IconName } from "./Icon";

/** Cambia este número cuando haya novedades nuevas: vuelve a mostrarse
 *  aunque el usuario marcara "no volver a mostrar" en una versión anterior. */
export const VAULT_NEWS_VERSION = 2;
const KEY = "settlia.vaultNews.hide";

export function vaultNewsHidden(): boolean {
  try { return Number(localStorage.getItem(KEY) || 0) >= VAULT_NEWS_VERSION; } catch { return false; }
}

const ITEMS: { icon: IconName; key: string }[] = [
  { icon: "card", key: "share" },
  { icon: "plus", key: "personal" },
  { icon: "chart", key: "forecast" },
  { icon: "repeat", key: "recurrents" },
  { icon: "sparkles", key: "estimate" },
  { icon: "filter", key: "reclass" },
  { icon: "key", key: "cats" },
];

export function VaultNewsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [hide, setHide] = useState(vaultNewsHidden());
  const close = () => {
    try {
      if (hide) localStorage.setItem(KEY, String(VAULT_NEWS_VERSION));
      else localStorage.removeItem(KEY);
    } catch { /* sin almacenamiento: se volverá a mostrar */ }
    onClose();
  };
  return (
    <Overlay onClose={close}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 anim-pop max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold inline-flex items-center gap-2"><Icon name="sparkles" size={18} /> {t("vnews.title")}</h3>
          <button onClick={close} className="glass rounded-full p-1.5" aria-label={t("common.close")}><Icon name="close" size={16} /></button>
        </div>
        <p className="text-sm text-muted mt-1">{t("vnews.subtitle")}</p>
        <ul className="mt-4 space-y-3">
          {ITEMS.map((it) => (
            <li key={it.key} className="flex gap-3">
              <span className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--teal) 16%, transparent)", color: "var(--teal)" }}>
                <Icon name={it.icon} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(`vnews.${it.key}.t`)}</span>
                <span className="block text-xs text-muted">{t(`vnews.${it.key}.d`)}</span>
              </span>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm mt-5">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="h-4 w-4" />
          {t("vnews.dontShow")}
        </label>
        <button onClick={close} className="w-full rounded-full py-3 font-semibold text-white mt-4" style={{ background: "linear-gradient(90deg, var(--indigo), var(--teal))" }}>
          {t("vnews.ok")}
        </button>
      </div>
    </Overlay>
  );
}
