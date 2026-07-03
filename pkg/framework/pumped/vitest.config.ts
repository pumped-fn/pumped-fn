import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@pumped-fn/lite-hono": resolve(__dirname, "../hono/src/index.ts"),
      "@pumped-fn/lite": resolve(__dirname, "../../core/lite/src/index.ts"),
    },
  },
})
