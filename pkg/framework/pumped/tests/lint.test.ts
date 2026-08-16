import { resolve } from "node:path"
import { scanPaths, scanText } from "@pumped-fn/lite-lint"
import { describe, expect, it } from "vitest"
import { generateManifest } from "../src/codegen"
import { entryCliSource, entryServerSource } from "../src/plugin"

const srcDir = resolve(__dirname, "../src")

describe("pumped honors its own lint rules", () => {
  it("scans the package source clean, with entry() registered as a handle factory and hosts as composition roots", async () => {
    const result = await scanPaths([srcDir], {
      rules: { "pumped/no-handle-factory": { allowHandleFactories: ["entry"] } },
      compositionPaths: ["/src/hosts/"],
    })

    expect(result.filesScanned).toBeGreaterThan(0)
    expect(result.diagnostics).toEqual([])
  })

  it("emits generated code that scans clean with no allowances at all", () => {
    const { source } = generateManifest(
      [{ name: "greet", file: "/abs/src/entries/greet.ts" }],
      "/abs/src/app.ts",
      { root: "/abs", app: "default", target: "server" }
    )
    const generated: [string, string][] = [
      ["manifest.mjs", source],
      ["entry-server-full.mjs", entryServerSource(["http", "cron", "workflow"])],
      ["entry-server-http.mjs", entryServerSource(["http"])],
      ["entry-server-none.mjs", entryServerSource([])],
      ["entry-cli.mjs", entryCliSource()],
    ]

    for (const [name, text] of generated) {
      expect(scanText(text, name), name).toEqual([])
    }
  })
})
