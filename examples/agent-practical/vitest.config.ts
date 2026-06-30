import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/agent-sdk": fileURLToPath(new URL("../../pkg/agent/core/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-claude": fileURLToPath(new URL("../../pkg/agent/claude/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-codex": fileURLToPath(new URL("../../pkg/agent/codex/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-just-bash": fileURLToPath(new URL("../../pkg/agent/bash/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-test": fileURLToPath(new URL("../../pkg/agent/test/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-suspense": fileURLToPath(new URL("../../pkg/ext/suspense/src/index.ts", import.meta.url)),
      "@pumped-fn/lite": fileURLToPath(new URL("../../pkg/core/lite/src/index.ts", import.meta.url)),
    },
  },
})
