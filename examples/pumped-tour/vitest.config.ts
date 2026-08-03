import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      { find: "@pumped-fn/pumped/app", replacement: fileURLToPath(new URL("../../pkg/framework/pumped/src/app.ts", import.meta.url)) },
      { find: "@pumped-fn/pumped/meta", replacement: fileURLToPath(new URL("../../pkg/framework/pumped/src/meta.ts", import.meta.url)) },
      { find: "@pumped-fn/pumped", replacement: fileURLToPath(new URL("../../pkg/framework/pumped/src/index.ts", import.meta.url)) },
      { find: "@pumped-fn/lite", replacement: fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
  },
})
