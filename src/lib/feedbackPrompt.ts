// Lógica del recordatorio automático de feedback.
// Regla (fase beta): aparece como mucho una vez por semana, hayan enviado o no.
//  - No antes de la 3ª apertura de la app (que tengan algo de experiencia).
//  - Tras mostrarlo (o tras enviar feedback) se reinicia el contador semanal.
//  - Sin tope: en beta queremos seguir captando opiniones.
// El botón del perfil para enviar feedback está SIEMPRE disponible, aparte de esto.

const OPENS = "settly.appOpens";
const LAST = "settly.feedbackPromptLast";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const MIN_OPENS = 3;

let countedThisLoad = false;

/** Cuenta una apertura de la app (una sola vez por carga de la página). */
export function registerAppOpen(): void {
  if (countedThisLoad) return;
  countedThisLoad = true;
  try {
    const n = (parseInt(localStorage.getItem(OPENS) || "0", 10) || 0) + 1;
    localStorage.setItem(OPENS, String(n));
  } catch {}
}

/** ¿Toca mostrar el recordatorio automático ahora? */
export function shouldShowFeedbackPrompt(): boolean {
  try {
    const opens = parseInt(localStorage.getItem(OPENS) || "0", 10) || 0;
    if (opens < MIN_OPENS) return false;
    const last = parseInt(localStorage.getItem(LAST) || "0", 10) || 0;
    if (!last) return true;
    return Date.now() - last >= WEEK;
  } catch {
    return false;
  }
}

/** Reinicia el contador semanal (al mostrar el aviso o al enviar feedback). */
export function markFeedbackPromptShown(): void {
  try {
    localStorage.setItem(LAST, String(Date.now()));
  } catch {}
}
