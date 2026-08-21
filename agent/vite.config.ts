import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Vite config for the Marina AI Command Hub dashboard.
// Builds the React SPA into `dist/`, which dashboard-server.js serves.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("scheduler")) {
              return "react";
            }
            if (id.includes("@tanstack/react-virtual")) {
              return "virtual";
            }
            if (
              id.includes("sonner") ||
              id.includes("cmdk") ||
              id.includes("lucide-react")
            ) {
              return "ui";
            }
          }
        },
      },
    },

  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the existing Node backend during dev.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
