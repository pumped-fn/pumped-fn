import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/lite": fileURLToPath(new URL("../../core/lite/src/index.ts", import.meta.url)),
    },
  },
})
