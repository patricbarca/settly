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
  },
};

export default config;
