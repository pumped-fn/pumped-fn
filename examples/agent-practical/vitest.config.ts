import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/sdk": fileURLToPath(new URL("../../pkg/sdk/core/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk-claude": fileURLToPath(new URL("../../pkg/sdk/claude/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk-codex": fileURLToPath(new URL("../../pkg/sdk/codex/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk-just-bash": fileURLToPath(new URL("../../pkg/sdk/bash/src/index.ts", import.meta.url)),
      "@pumped-fn/sdk-test": fileURLToPath(new URL("../../pkg/sdk/test/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-suspense": fileURLToPath(new URL("../../pkg/ext/suspense/src/index.ts", import.meta.url)),
      "@pumped-fn/lite": fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)),
    },
  },
})
