import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { slatePwa } from "./slate-pwa";
import { copyFileSync } from "node:fs";
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    slatePwa(),
    {
      name: "slate-static-entry",
      closeBundle() {
        copyFileSync("dist/standalone/standalone.html", "dist/standalone/index.html");
      },
    },
  ],
  build: {
    outDir: "dist/standalone",
    emptyOutDir: true,
    rollupOptions: { input: "standalone.html" },
  },
});
