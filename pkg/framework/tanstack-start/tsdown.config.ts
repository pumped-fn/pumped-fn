import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/vite.ts"],
  dts: true,
  format: ["cjs", "esm"],
  clean: true,
})
