import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.dom.ts"],
    coverage: {
      provider: "v8",
      include: ["patterns/**/after.ts", "patterns/**/view.tsx", "capstone/src/**/*.ts", "capstone/src/**/*.tsx"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
