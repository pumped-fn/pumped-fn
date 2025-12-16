import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli.ts",
    "src/transforms/core-next-to-lite.ts",
  ],
  dts: true,
  format: ["cjs", "esm"],
  clean: true,
  outDir: "dist",
});
