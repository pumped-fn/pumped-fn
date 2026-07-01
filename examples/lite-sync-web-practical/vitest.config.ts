import { playwright } from "@vitest/browser-playwright"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  optimizeDeps: {
    include: [
      "@testing-library/jest-dom/vitest",
      "@testing-library/react",
      "react",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
    ],
  },
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.tsx"],
          environment: "node",
          globals: true,
        },
      },
      {
        test: {
          name: "browser",
          include: ["**/*.browser.test.tsx"],
          globals: true,
          setupFiles: ["./tests/setup.browser.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/app.tsx", "src/model.ts", "src/runtime.ts", "src/web.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
