import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/runtime.ts"],
  format: {
    esm: {},
    cjs: {
      define: {
        "import.meta.hot": "undefined",
      },
    },
  },
  dts: true,
  clean: true,
  splitting: false,
  fixedExtension: false,
})
