import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useT, useLang } from "../lib/i18n";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";

// Número de WhatsApp de Settlia (Twilio). Mientras usemos el sandbox de Twilio
// hay que mandar primero "join <palabras>" (VITE_WA_JOIN); con un número propio
// aprobado por Meta se deja vacío y ese paso desaparece.
const WA_NUMBER = (import.meta.env.VITE_WA_NUMBER as string | undefined) ?? "";
/** El botón solo aparece cuando hay un número configurado (Twilio listo). */
export const WA_ENABLED = !!WA_NUMBER;
const WA_JOIN = (import.meta.env.VITE_WA_JOIN as string | undefined) ?? "";

function waLink(text: string) {
  return `https://wa.me/${WA_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Conectar WhatsApp: genera un código de 6 cifras (RPC wa_link_code) que el
 *  usuario envía al bot; la Edge Function `whatsapp-webhook` lo canjea. */
export function WhatsAppModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [linked, setLinked] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function refresh() {
    const { data } = await supabase.from("whatsapp_links").select("phone").maybeSingle();
    setLinked(data?.phone ?? null);
  }
  useEffect(() => { refresh(); }, []);
  // Mientras se muestra el código, comprobamos cada pocos segundos si ya se vinculó.
  useEffect(() => {
    if (!code || linked) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [code, linked]);

  async function getCode() {
    setErr(false);
    const { data, error } = await supabase.rpc("wa_link_code", { p_lang: lang });
    if (error || !data) { setErr(true); return; }
    setCode(String(data));
  }
  async function unlink() {
    await supabase.rpc("wa_unlink");
    setCode(null);
    setLinked(null);
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2">
          <span className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(37,211,102,0.16)", color: "#25D366" }}>
            <Icon name="chat" size={18} />
          </span>
          <h3 className="font-display text-xl font-bold flex-1">{t("wa.title")}</h3>
          <button onClick={onClose} className="text-muted" aria-label={t("common.close")}><Icon name="close" size={18} /></button>
        </div>
        <p className="text-sm text-muted">{t("wa.sub")}</p>

        <div className="glass rounded-2xl p-3 mt-4 text-sm space-y-1">
          <div>💬 <i>{t("wa.ex1")}</i></div>
          <div>🎤 {t("wa.ex2")}</div>
          <div>↩️ {t("wa.ex3")}</div>
        </div>

        {linked === undefined ? null : linked ? (
          <div className="mt-4">
            <p className="text-sm font-semibold" style={{ color: "var(--teal)" }}>✓ {t("wa.linked", { phone: linked })}</p>
            <div className="flex gap-2 mt-3">
              <a href={waLink(lang === "en" ? "help" : "ayuda")} target="_blank" rel="noreferrer" className="rounded-full px-5 py-2.5 font-semibold text-white" style={{ background: "#25D366" }}>
                {t("wa.open")}
              </a>
              <button onClick={unlink} className="glass rounded-full px-4 py-2.5 text-sm text-muted">{t("wa.unlink")}</button>
            </div>
          </div>
        ) : code ? (
          <ol className="mt-4 space-y-3 text-sm">
            {WA_JOIN && (
              <li>
                <b>1.</b> {t("wa.stepJoin")}
                <a href={waLink(`join ${WA_JOIN}`)} target="_blank" rel="noreferrer" className="block mt-1.5 glass rounded-xl px-3 py-2 font-mono">join {WA_JOIN}</a>
              </li>
            )}
            <li>
              <b>{WA_JOIN ? "2." : "1."}</b> {t("wa.stepCode")}
              <a href={waLink(code)} target="_blank" rel="noreferrer" className="flex items-center justify-between mt-1.5 rounded-xl px-3 py-2.5 font-bold text-white text-lg tracking-widest" style={{ background: "#25D366" }}>
                {code} <span className="text-xs font-semibold tracking-normal">{t("wa.send")} →</span>
              </a>
              <p className="text-xs text-muted mt-1">{t("wa.codeHint")}</p>
            </li>
          </ol>
        ) : (
          <button onClick={getCode} className="w-full rounded-full px-5 py-3 mt-4 font-semibold text-white" style={{ background: "#25D366" }}>
            {t("wa.connect")}
          </button>
        )}
        {err && <p className="text-xs mt-2" style={{ color: "var(--coral)" }}>{t("wa.error")}</p>}
        <p className="text-[11px] text-muted mt-4">{t("wa.privacy")}</p>
      </div>
    </Overlay>
  );
}
