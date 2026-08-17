import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    server: {
      deps: {
        inline: ["@pumped-fn/lite-extension-scheduler"],
      },
    },
  },
  resolve: {
    alias: {
      "@pumped-fn/lite-lint": resolve(__dirname, "../../tool/lint/src/index.ts"),
      "@pumped-fn/lite": resolve(__dirname, "../../core/lite/src/index.ts"),
    },
  },
})
