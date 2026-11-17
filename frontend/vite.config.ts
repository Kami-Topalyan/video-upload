import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api is proxied to the backend. Inside docker-compose.dev.yml this is http://api:4000.
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Bind-mounted folders on macOS/Windows don't emit file events; set VITE_USE_POLLING=1 there.
    watch: process.env.VITE_USE_POLLING ? { usePolling: true } : undefined,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
});
