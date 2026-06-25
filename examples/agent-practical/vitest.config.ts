import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/agent-sdk": fileURLToPath(new URL("../../packages/agent-sdk/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-claude": fileURLToPath(new URL("../../packages/agent-sdk-claude/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-codex": fileURLToPath(new URL("../../packages/agent-sdk-codex/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-just-bash": fileURLToPath(new URL("../../packages/agent-sdk-just-bash/src/index.ts", import.meta.url)),
      "@pumped-fn/agent-sdk-test": fileURLToPath(new URL("../../packages/agent-sdk-test/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-suspense": fileURLToPath(new URL("../../packages/lite-extension-suspense/src/index.ts", import.meta.url)),
      "@pumped-fn/lite": fileURLToPath(new URL("../../packages/lite/src/index.ts", import.meta.url)),
    },
  },
})
