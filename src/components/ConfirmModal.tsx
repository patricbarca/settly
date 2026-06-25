import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

/** Diálogo de confirmación genérico (para acciones destructivas como borrar
 *  un gasto o un recurrente). Evita borrados accidentales con un paso extra. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2">
          <span
            className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: danger ? "rgba(255,90,77,0.14)" : "var(--pill-bg)", color: danger ? "var(--coral)" : "var(--pill-fg)" }}
          >
            <Icon name={danger ? "trash" : "help"} size={18} />
          </span>
          <h3 className="font-display text-xl font-bold">{title}</h3>
        </div>
        {message && <p className="text-sm text-muted mb-4">{message}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="rounded-full px-5 py-2.5 font-medium text-white hover-lift"
            style={{ background: danger ? "var(--coral)" : "var(--ink)" }}
          >
            {confirmLabel ?? t("common.delete")}
          </button>
          <button onClick={onClose} className="glass rounded-full px-5 py-2.5 text-muted hover-lift">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
