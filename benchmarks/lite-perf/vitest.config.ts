import { playwright } from "@vitest/browser-playwright"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["**/*.test.ts", "**/*.bench.ts"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.tsx", "**/*.browser.bench.tsx"],
          environment: "node",
          globals: true,
        },
      },
      {
        test: {
          name: "browser",
          include: ["**/*.browser.test.tsx", "**/*.browser.bench.tsx"],
          globals: true,
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
