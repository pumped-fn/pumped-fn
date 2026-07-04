import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 120000,
    testTimeout: 120000,
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@pumped-fn/lite-extension-scheduler": resolve(__dirname, "../scheduler/src/index.ts"),
    },
  },
})
