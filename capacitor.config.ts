import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.settlia.pwa",
  appName: "Settlia",
  webDir: "dist",
  server: {
    // Carga la build local empaquetada (offline-first). Si prefieres que la
    // app siempre sirva la última versión desde app.settlia.app, cambia esto
    // por { url: "https://app.settlia.app", cleartext: false } — pero pierdes
    // el bundle offline nativo y dependes de conexión al abrir.
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    // Fondo nativo del WKWebView. Por defecto es blanco y se asoma en la franja
    // del home-indicator (safe-area inferior), fuera del área web — por eso el
    // splash mostraba una barra blanca abajo que el CSS no podía tapar. En el
    // uso normal queda oculto tras la BottomNav; solo se ve durante el splash.
    backgroundColor: "#0D1B2A",
  },
};

export default config;
