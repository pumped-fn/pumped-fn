import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { tsconfig: "tsconfig.dts.json" },
  sourcemap: true,
  clean: true,
})
