import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/app.ts", "src/meta.ts", "src/runtime.ts", "src/cli.ts"],
  dts: { tsconfig: "tsconfig.dts.json" },
  format: ["cjs", "esm"],
  clean: true,
})
