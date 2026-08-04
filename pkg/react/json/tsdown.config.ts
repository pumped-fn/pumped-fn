import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: { tsconfig: "tsconfig.dts.json" },
  format: ["cjs", "esm"],
  clean: true,
});
