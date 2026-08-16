import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Parser } from "acorn"
import { describe, expect, it } from "vitest"
import { generateManifest } from "../src/codegen"

function emit(dir: string, entrySource: string): string {
  const entryFile = join(dir, "entry.mjs")
  writeFileSync(entryFile, entrySource)
  const { source } = generateManifest([{ name: "probe", file: entryFile }], undefined, {
    root: dir,
    app: "default",
    target: "server",
  })
  const manifestFile = join(dir, "manifest.mjs")
  writeFileSync(manifestFile, source)
  return manifestFile
}

describe("generateManifest output", () => {
  it("parses as plain ECMAScript with no TypeScript-only syntax", () => {
    const { source } = generateManifest(
      [{ name: "book-space", file: "/abs/src/entries/book-space.ts" }],
      "/abs/src/app.ts",
      { root: "/abs", app: "default", target: "server" }
    )

    expect(() => Parser.parse(source, { ecmaVersion: "latest", sourceType: "module" })).not.toThrow()
    expect(source).not.toMatch(/\bas const\b/)
  })

  it("accepts a branded entry default without importing anything", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pumped-codegen-"))
    const manifestFile = emit(
      dir,
      'export default { [Symbol.for("@pumped-fn/pumped/entry")]: { flow: null, tags: [] } }\n'
    )

    const manifest = await import(manifestFile)
    expect(manifest.entries).toHaveLength(1)
    expect(manifest.entries[0].name).toBe("probe")
  })

  it("throws the friendly named error when an entry has no default export", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pumped-codegen-"))
    const manifestFile = emit(dir, "export const other = 1\n")

    await expect(import(manifestFile)).rejects.toThrow(/entry "probe".*has no default export/)
  })

  it("names the bare-flow mistake and the fix", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pumped-codegen-"))
    const manifestFile = emit(dir, 'export default { [Symbol.for("@pumped-fn/lite/flow")]: true }\n')

    await expect(import(manifestFile)).rejects.toThrow(
      /entry "probe".*default-exports a bare flow; wrap it in entry\(\{ flow, tags \}\)/
    )
  })

  it("rejects a default export that is neither an entry nor a flow", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pumped-codegen-"))
    const manifestFile = emit(dir, "export default { plain: true }\n")

    await expect(import(manifestFile)).rejects.toThrow(/entry "probe".*must default-export entry\(\{ flow, tags \}\)/)
  })
})
