import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy Socket.IO traffic to the Node server on :3000.
// In production the Node server serves the built files directly (same origin).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
