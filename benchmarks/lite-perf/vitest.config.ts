import { fileURLToPath } from "node:url"
import { playwright } from "@vitest/browser-playwright"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/lite-react": fileURLToPath(new URL("../../packages/lite-react/src/index.ts", import.meta.url)),
      "@pumped-fn/lite": fileURLToPath(new URL("../../packages/lite/src/index.ts", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
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
