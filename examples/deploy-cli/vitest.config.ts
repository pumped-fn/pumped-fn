import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/lite": fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-logging": fileURLToPath(new URL("../../pkg/ext/logging/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-observable": fileURLToPath(new URL("../../pkg/ext/observable/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
})
