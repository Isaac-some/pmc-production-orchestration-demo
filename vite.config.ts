import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_PUBLIC_DEMO === "true" ? "./" : "/",
  server: { host: "127.0.0.1", port: 4318 },
  build: { outDir: "dist" },
});
