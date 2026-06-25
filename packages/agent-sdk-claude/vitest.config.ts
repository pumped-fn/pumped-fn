import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pumped-fn/agent-sdk": fileURLToPath(new URL("../agent-sdk/src/index.ts", import.meta.url)),
      "@pumped-fn/lite-extension-suspense": fileURLToPath(new URL("../lite-extension-suspense/src/index.ts", import.meta.url)),
      "@pumped-fn/lite": fileURLToPath(new URL("../lite/src/index.ts", import.meta.url)),
    },
  },
});
