import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test-d.ts"],
    typecheck: {
      tsconfig: "./tsconfig.json",
    },
  },
});
