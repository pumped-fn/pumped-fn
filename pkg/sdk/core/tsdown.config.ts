import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    agent: "src/agent.ts",
    session: "src/session.ts",
    validation: "src/validation.ts",
    sandbox: "src/sandbox.ts",
  },
  dts: true,
  format: ["cjs", "esm"],
  clean: true,
});
