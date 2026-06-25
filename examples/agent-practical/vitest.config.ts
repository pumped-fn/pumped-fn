import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/agent-sdk": fileURLToPath(new URL("../../packages/agent-sdk/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-suspense": fileURLToPath(new URL("../../packages/lite-extension-suspense/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-workflow": fileURLToPath(new URL("../../packages/lite-extension-workflow/src/index.ts", import.meta.url)),
      "@pumped-fn/lite": fileURLToPath(new URL("../../packages/lite/src/index.ts", import.meta.url)),
    },
  },
})
