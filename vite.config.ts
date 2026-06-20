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
        navigateFallback: "/settly/index.html",
        navigateFallbackDenylist: [/^\/api/],
      },
      includeAssets: ["icons/icon.svg"],
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
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  base: "/settly/",
  server: { port: 5174 },
});
