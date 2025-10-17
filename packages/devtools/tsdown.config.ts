import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/bin/pumped-cli.ts"],
  dts: true,
  format: ["cjs", "esm"],
});
