import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100
      }
    }
  },
  resolve: {
    alias: {
      "@pumped-fn/lite": resolve(__dirname, "../../core/lite/src/index.ts"),
      "@pumped-fn/lite-extension-observable": resolve(__dirname, "../observable/src/index.ts")
    }
  }
})
