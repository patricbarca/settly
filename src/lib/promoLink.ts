// Enlace de regalo de Pro: https://app.settlia.app/?pro=CODIGO
//
// El código se captura al cargar (antes del login: el OAuth de Google vuelve
// sin el parámetro) y se guarda; en cuanto hay sesión, App.tsx lo canjea con
// el mismo RPC que el campo "código" del Paywall (`redeem_access_code`, que
// nunca empeora un Pro que ya tengas).
const KEY = "settlia.pendingPro";

export function capturePromoFromUrl() {
  try {
    const url = new URL(window.location.href);
    const code = (url.searchParams.get("pro") || "").trim();
    if (!code) return;
    localStorage.setItem(KEY, code.slice(0, 64));
    url.searchParams.delete("pro");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

export function takePendingPromo(): string | null {
  try {
    const c = localStorage.getItem(KEY);
    if (c) localStorage.removeItem(KEY);
    return c;
  } catch {
    return null;
  }
}
