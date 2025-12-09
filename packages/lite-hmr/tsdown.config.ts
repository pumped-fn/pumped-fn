import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/runtime.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
})
