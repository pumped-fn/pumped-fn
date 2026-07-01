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
          name: "browser",
          include: ["**/*.browser.test.tsx"],
          exclude: [...configDefaults.exclude],
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
  },
})
