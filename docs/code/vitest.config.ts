import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.ts"],
    exclude: ["index.ts", "*.config.ts"],
  },
});
