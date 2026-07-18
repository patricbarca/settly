// Consentimiento para enviar datos a servicios de IA de terceros (guideline
// 5.1.1(i)/5.1.2(i) de Apple). Antes de mandar una FOTO de recibo, AUDIO de voz
// o TEXTO a la IA, se pide permiso explícito una vez, explicando qué se envía y
// a quién. Gate basado en promesa para poder await-earlo desde cualquier sitio.
const KEY = "settly.aiConsent";

let opener: (() => void) | null = null;
let pending: ((v: boolean) => void)[] = [];

export function hasAIConsent(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Resuelve true si ya hay consentimiento; si no, abre el modal y resuelve
 *  cuando el usuario decide. */
export function requestAIConsent(): Promise<boolean> {
  if (hasAIConsent()) return Promise.resolve(true);
  return new Promise((resolve) => {
    pending.push(resolve);
    if (opener) opener();
    else resolve(false); // sin modal montado: no enviar
  });
}

/** Lo llama el modal al decidir. */
export function resolveAIConsent(accepted: boolean) {
  if (accepted) {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  }
  const cbs = pending;
  pending = [];
  cbs.forEach((r) => r(accepted));
}

/** El App registra cómo abrir el modal de consentimiento. */
export function registerAIConsentOpener(fn: (() => void) | null) {
  opener = fn;
}

export class AIConsentDeclined extends Error {
  constructor() {
    super("ai_consent_declined");
    this.name = "AIConsentDeclined";
  }
}
