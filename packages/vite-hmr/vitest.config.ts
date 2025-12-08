import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@pumped-fn/lite": resolve(__dirname, "../lite/src/index.ts"),
    },
  },
})
