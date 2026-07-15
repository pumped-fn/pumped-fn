import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      { find: "@pumped-fn/lite", replacement: fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/agent", replacement: fileURLToPath(new URL("../../pkg/sdk/core/src/agent.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/session", replacement: fileURLToPath(new URL("../../pkg/sdk/core/src/session.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/sandbox", replacement: fileURLToPath(new URL("../../pkg/sdk/core/src/sandbox.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/validation", replacement: fileURLToPath(new URL("../../pkg/sdk/core/src/validation.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk", replacement: fileURLToPath(new URL("../../pkg/sdk/core/src/index.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk-test", replacement: fileURLToPath(new URL("../../pkg/sdk/test/src/index.ts", import.meta.url)) }
    ]
  },
  test: {
    environment: "node"
  }
})
