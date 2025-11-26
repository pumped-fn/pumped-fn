import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test-d.ts"],
    setupFiles: ["./tests/setup.ts"],
    typecheck: {
      tsconfig: "./tsconfig.json",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/**",
        "tests/**",
        "*.config.*",
        "dist/**",
        "benchmark/**",
        "scripts/**",
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 65,
      statements: 80,
    },
  },
});
