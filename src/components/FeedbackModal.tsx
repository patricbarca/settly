// Ventana de feedback: dos modos en un mismo modal —
//  ⭐ Valorar (1–5 estrellas + comentario opcional)
//  🐞 Reportar problema (texto + contexto técnico automático)
// Se abre desde el perfil (AccountModal). Guarda en Supabase vía sendFeedback.
import { useState } from "react";
import { Overlay } from "./Overlay";
import { Icon } from "./Icon";
import { useT } from "../lib/i18n";
import { sendFeedback, type FeedbackType } from "../lib/feedback";

function Star({ filled, onClick, onHover }: { filled: boolean; onClick: () => void; onHover: () => void }) {
  return (
    <button type="button" onClick={onClick} onMouseEnter={onHover} className="hover-lift p-0.5" aria-label="star">
      <svg width="34" height="34" viewBox="0 0 24 24"
        fill={filled ? "var(--amber)" : "none"}
        stroke={filled ? "var(--amber)" : "var(--muted)"}
        strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 3.2l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z" />
      </svg>
    </button>
  );
}

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<FeedbackType>("rating");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const canSend = mode === "rating" ? rating > 0 : message.trim().length > 0;

  async function submit() {
    if (!canSend || sending) return;
    setSending(true);
    setError("");
    const r = await sendFeedback({
      type: mode,
      rating: mode === "rating" ? rating : undefined,
      message,
    });
    setSending(false);
    if (r.ok) {
      setDone(true);
    } else {
      setError(r.error === "no-session" ? t("feedback.errorSession") : t("feedback.errorGeneric"));
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold">{t("feedback.title")}</h2>
          <button onClick={onClose} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift">
            <Icon name="close" size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <div className="flex justify-center mb-3">
              <span className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "rgba(10,139,94,0.14)", color: "#0A8B5E" }}>
                <Icon name="check" size={28} />
              </span>
            </div>
            <p className="font-semibold text-lg">{t("feedback.thanks")}</p>
            <p className="text-sm text-muted mt-1">{t("feedback.thanksSub")}</p>
            <button onClick={onClose} className="mt-5 rounded-full px-6 py-3 font-semibold text-white hover-lift" style={{ background: "var(--ink)" }}>
              {t("common.close")}
            </button>
          </div>
        ) : (
          <>
            {/* Toggle de modo */}
            <div className="glass rounded-full p-1 flex text-sm font-semibold mb-5">
              {([
                ["rating", t("feedback.tabRate")],
                ["bug", t("feedback.tabBug")],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 px-3 py-2 rounded-full transition-colors ${mode === m ? "" : "text-muted"}`}
                  style={mode === m ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "rating" ? (
              <div className="mb-4">
                <p className="text-sm font-semibold mb-2 text-center">{t("feedback.rateHint")}</p>
                <div className="flex justify-center gap-0.5 mb-3" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} filled={i <= (hover || rating)} onClick={() => setRating(i)} onHover={() => setHover(i)} />
                  ))}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedback.ratePlaceholder")}
                  rows={3}
                  className="glass rounded-2xl px-4 py-3 text-sm w-full resize-none"
                />
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-sm font-semibold mb-2">{t("feedback.bugHint")}</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedback.bugPlaceholder")}
                  rows={4}
                  className="glass rounded-2xl px-4 py-3 text-sm w-full resize-none"
                  autoFocus
                />
                <p className="text-[11px] text-muted mt-2 flex items-start gap-1.5">
                  <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
                  {t("feedback.bugContext")}
                </p>
              </div>
            )}

            {error && <p className="text-xs mb-3 text-center" style={{ color: "var(--coral)" }}>{error}</p>}

            <button
              onClick={submit}
              disabled={!canSend || sending}
              className="w-full rounded-full py-3.5 font-semibold text-white hover-lift disabled:opacity-50"
              style={{ background: "var(--ink)" }}
            >
              {sending ? t("feedback.sending") : t("feedback.send")}
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}
