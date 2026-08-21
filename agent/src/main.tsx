import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// Initialize theme from localStorage before first paint to avoid flash.
(function initTheme() {
  try {
    const saved = localStorage.getItem("marina_theme");
    const theme = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

createRoot(rootEl).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "var(--surface-2)",
          border: "1px solid var(--border-muted)",
          color: "var(--text-primary)",
        },
      }}
    />
  </StrictMode>,
);
