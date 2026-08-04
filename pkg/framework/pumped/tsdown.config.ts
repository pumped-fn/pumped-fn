import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/app.ts", "src/meta.ts", "src/cli.ts"],
  dts: { tsconfig: "tsconfig.dts.json" },
  format: ["cjs", "esm"],
  clean: true,
})
