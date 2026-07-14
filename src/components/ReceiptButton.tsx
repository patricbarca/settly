import { useState } from "react";
import { getReceiptUrl } from "../lib/storage";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

// Botón "Ver recibo" en el detalle de un gasto: pide una URL firmada temporal y
// muestra la foto del ticket a pantalla completa. La imagen vive en Storage
// (bucket privado); aquí solo tenemos la ruta.
export function ReceiptButton({ path }: { path: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function show() {
    setOpen(true);
    if (url) return;
    setLoading(true);
    setError(false);
    const u = await getReceiptUrl(path);
    setLoading(false);
    if (u) setUrl(u);
    else setError(true);
  }

  return (
    <>
      <button
        onClick={show}
        className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted inline-flex items-center gap-1"
      >
        <Icon name="paperclip" size={13} /> {t("exp.viewReceipt")}
      </button>
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <div className="anim-pop max-w-lg w-full relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              className="absolute -top-2 -right-2 z-10 glass-strong rounded-full h-9 w-9 flex items-center justify-center hover-lift shadow-lg"
            >
              <Icon name="close" size={16} />
            </button>
            {loading && <div className="glass-strong rounded-3xl p-8 text-center text-muted">…</div>}
            {error && <div className="glass-strong rounded-3xl p-8 text-center text-muted">{t("exp.receiptError")}</div>}
            {url && <img src={url} alt="" className="w-full rounded-3xl" />}
          </div>
        </Overlay>
      )}
    </>
  );
}
