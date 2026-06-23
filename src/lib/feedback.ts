// Envío de feedback de usuarios (valoración ⭐ o reporte de bug) a Supabase.
// La tabla `feedback` (ver supabase/feedback.sql) solo permite INSERT propio;
// nadie lo lee desde la app — se consulta desde el panel de Supabase.
import { supabase } from "./supabase";
import { getLang } from "./i18n";
import { isStandalone, isIOS } from "./pwa";

export type FeedbackType = "rating" | "bug";

export interface FeedbackInput {
  type: FeedbackType;
  rating?: number;     // 1–5, solo para type "rating"
  message: string;
}

/** Contexto técnico que adjuntamos automáticamente (útil para depurar bugs). */
function gatherContext() {
  return {
    version: typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev",
    lang: getLang(),
    standalone: isStandalone(),
    ios: isIOS(),
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    platform: typeof navigator !== "undefined" ? navigator.platform : "",
    url: typeof location !== "undefined" ? location.href : "",
  };
}

/** Guarda el feedback. Devuelve un error legible si falla (p. ej. sin sesión). */
export async function sendFeedback(input: FeedbackInput): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "no-session" };

  const { error } = await supabase.from("feedback").insert({
    user_id: session.user.id,
    type: input.type,
    rating: input.type === "rating" ? input.rating ?? null : null,
    message: input.message.trim(),
    context: gatherContext(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
