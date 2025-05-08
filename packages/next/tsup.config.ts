import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true,
  target: ["node18", "es2022"],
  outDir: "dist",
  sourcemap: true,
});
