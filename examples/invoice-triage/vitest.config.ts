import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/lite": fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-logging": fileURLToPath(new URL("../../pkg/ext/logging/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-scheduler": fileURLToPath(new URL("../../pkg/ext/scheduler/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk": fileURLToPath(new URL("../../pkg/sdk/core/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk-codex": fileURLToPath(new URL("../../pkg/sdk/codex/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk-test": fileURLToPath(new URL("../../pkg/sdk/test/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
})
