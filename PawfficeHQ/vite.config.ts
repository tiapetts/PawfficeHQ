import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    babel({
      presets: [reactCompilerPreset()],
    }),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: ["pwa-icon.png"],

      manifest: {
        name: "Pawffice HQ",
        short_name: "Pawffice HQ",
        description: "Business management software for pet-care professionals.",

        start_url: "/",
        scope: "/",

        display: "standalone",
        orientation: "any",

        background_color: "#f4f7f6",
        theme_color: "#183f37",

        icons: [
          {
            src: "/pwa-icon.png",
            sizes: "2000x2000",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-icon.png",
            sizes: "2000x2000",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
      },

      devOptions: {
        enabled: true,
      },
    }),
  ],
});
