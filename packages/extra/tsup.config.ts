import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client.ts",
    "src/server.ts",
    "src/bun/index.ts",
    "src/meta/http.ts",
    "src/standardschema.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true,
  target: ["node18", "es2022"],
  outDir: "dist",
  sourcemap: true,
});
