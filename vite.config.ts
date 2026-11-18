import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, "index.html"), player: resolve(import.meta.dirname, "player.html") },
    },
  },
});
