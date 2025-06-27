import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/server.ts", "src/implicit.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true,
  target: ["node20", "es2022"],
  outDir: "dist",
  sourcemap: true,
});
