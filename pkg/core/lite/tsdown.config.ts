import manifest from "./package.json" with { type: "json" };
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  define: {
    __PUMPED_LITE_VERSION__: JSON.stringify(manifest.version),
  },
  dts: { tsconfig: "tsconfig.dts.json" },
  format: ["cjs", "esm"],
  clean: true,
  minify: true,
});
