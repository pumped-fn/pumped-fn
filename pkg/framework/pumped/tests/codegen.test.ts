import { describe, expect, it } from "vitest"
import { generateManifest } from "../src/codegen"

describe("generateManifest", () => {
  it("emits static imports and an entries array with an app.ts import", () => {
    const source = generateManifest(
      [{ kind: "server", name: "book-space", file: "/abs/src/server/book-space.ts" }],
      "/abs/src/app.ts"
    )

    expect(source).toBe(
      [
        'import * as ns0 from "/abs/src/server/book-space.ts"',
        'import app from "/abs/src/app.ts"',
        "",
        "function entryDefault(ns, name, file) {",
        "  if (ns.default === undefined) {",
        '    throw new Error(`entry "${name}" in ${file} has no default export`)',
        "  }",
        "  return ns.default",
        "}",
        "",
        'const e0 = entryDefault(ns0, "book-space", "/abs/src/server/book-space.ts")',
        "",
        "export { app }",
        "export const entries = [",
        '  { kind: "server", name: "book-space", file: "/abs/src/server/book-space.ts", flow: e0, meta: ns0.meta }',
        "]",
        "",
      ].join("\n")
    )
  })

  it("falls back to an undefined app when there is no app.ts", () => {
    const source = generateManifest([], undefined)

    expect(source).toBe(
      [
        "const app = undefined",
        "",
        "function entryDefault(ns, name, file) {",
        "  if (ns.default === undefined) {",
        '    throw new Error(`entry "${name}" in ${file} has no default export`)',
        "  }",
        "  return ns.default",
        "}",
        "",
        "export { app }",
        "export const entries = [",
        "",
        "]",
        "",
      ].join("\n")
    )
  })

  it("throws the friendly named error, not a raw ESM error, when an entry has no default export", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const dir = mkdtempSync(join(tmpdir(), "pumped-codegen-"))
    const file = join(dir, "no-default.mjs")
    writeFileSync(file, "export const meta = { not: 'default' }\n")

    const source = generateManifest([{ kind: "server", name: "no-default", file }], undefined)
    const moduleFile = join(dir, "manifest.mjs")
    writeFileSync(moduleFile, source)

    await expect(import(moduleFile)).rejects.toThrow(/entry "no-default".*has no default export/)
  })
})
