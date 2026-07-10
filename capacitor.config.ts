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
    // "never": el contenido web ocupa toda la pantalla (bajo la barra de estado
    // y el home-indicator). Las safe-areas las cubren el header (body::before) y
    // la BottomNav vía env(safe-area-inset-*). Con "automatic" el WebView
    // recortaba el contenido y dejaba ver franjas del fondo nativo arriba/abajo.
    contentInset: "never",
    // Fondo nativo del WKWebView = navy del splash (solo se ve durante la carga
    // y en el rebote de scroll; en reposo lo tapa el contenido).
    backgroundColor: "#0D1B2A",
  },
};

export default config;
