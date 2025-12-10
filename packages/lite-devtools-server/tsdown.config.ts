import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.tsx"],
  dts: true,
  format: ["cjs", "esm"],
  clean: true,
});
