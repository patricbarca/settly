import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2}"],
        // No precachear el motor de IA local (transformers.js + ONNX wasm):
        // se cargan bajo demanda solo al usar la voz, no en cada instalación.
        globIgnores: ["**/transformers*.js", "**/ort-*.wasm", "**/*.wasm"],
        navigateFallback: "/settly/index.html",
        navigateFallbackDenylist: [/^\/api/],
      },
      includeAssets: ["icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Settly",
        short_name: "Settly",
        description: "Gastos en grupo, sin líos.",
        theme_color: "#0FA3A3",
        background_color: "#111111",
        display: "standalone",
        orientation: "portrait",
        start_url: "/settly/",
        scope: "/settly/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  base: "/settly/",
  server: { port: 5174 },
});
