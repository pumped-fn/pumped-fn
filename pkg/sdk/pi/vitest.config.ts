import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@pumped-fn\/sdk$/, replacement: fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/agent", replacement: fileURLToPath(new URL("../core/src/agent.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/session", replacement: fileURLToPath(new URL("../core/src/session.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/validation", replacement: fileURLToPath(new URL("../core/src/validation.ts", import.meta.url)) },
      { find: "@pumped-fn/sdk/sandbox", replacement: fileURLToPath(new URL("../core/src/sandbox.ts", import.meta.url)) },
      { find: "@pumped-fn/lite-extension-suspense", replacement: fileURLToPath(new URL("../../ext/suspense/src/index.ts", import.meta.url)) },
      { find: "@pumped-fn/lite", replacement: fileURLToPath(new URL("../../core/lite/src/index.ts", import.meta.url)) },
    ],
  },
  test: { include: ["tests/**/*.test.ts"] },
})
