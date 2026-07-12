import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: repository ? `/${repository}/` : "/",
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts")) return "charts";
          if (id.includes("axios")) return "http";
          return undefined;
        }
      }
    }
  }
});
