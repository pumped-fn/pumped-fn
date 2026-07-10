import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  base: process.env.PUMPED_COMPARE_BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@pumped-fn/lite": fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 4178,
  },
})
