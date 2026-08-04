import { describe, expect, it } from "vitest"
import { generateManifest } from "../src/codegen"

describe("generateManifest", () => {
  it("emits stable manifest paths and identity across checkout roots", () => {
    const first = generateManifest(
      [{ kind: "server", name: "book-space", file: "/first/src/server/book-space.ts" }],
      "/first/src/apps/east.ts",
      { root: "/first", app: "east", target: "server" }
    )
    const second = generateManifest(
      [{ kind: "server", name: "book-space", file: "/second/src/server/book-space.ts" }],
      "/second/src/apps/east.ts",
      { root: "/second", app: "east", target: "server" }
    )
    expect(first.source).toContain('file: "src/server/book-space.ts"')
    expect(first.source).not.toContain('file: "/first/src/server/book-space.ts"')
    expect(first.identity.app).toBe("east")
    expect(first.identity.target).toBe("server")
    expect(first.identity.hash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.identity).toEqual(second.identity)
    expect(first.source).toContain(`export const identity = ${JSON.stringify(first.identity)}`)
  })

  it("emits static imports and an entries array with an app.ts import", () => {
    const { source } = generateManifest(
      [{ kind: "server", name: "book-space", file: "/abs/src/server/book-space.ts" }],
      "/abs/src/app.ts",
      { root: "/abs", app: "default", target: "server" }
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
        'const e0 = entryDefault(ns0, "book-space", "src/server/book-space.ts")',
        "",
        'export const identity = {"app":"default","target":"server","hash":"sha256:b218e8dd9912fc668ce75c9a4aa8a6a68599934e196d628157f08b59f20e2b99"}',
        "export { app }",
        "export const entries = [",
        '  { kind: "server", name: "book-space", file: "src/server/book-space.ts", flow: e0, meta: ns0.meta }',
        "]",
        "",
      ].join("\n")
    )
  })

  it("falls back to an undefined app when there is no app.ts", () => {
    const { source } = generateManifest([], undefined, { root: "/abs", app: "default", target: "server" })

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
        'export const identity = {"app":"default","target":"server","hash":"sha256:11d611c036a75de6037a4f2676b5dc679e9e4b710a45b25ea708bbbda0614f17"}',
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

    const { source } = generateManifest(
      [{ kind: "server", name: "no-default", file }],
      undefined,
      { root: dir, app: "default", target: "server" }
    )
    const moduleFile = join(dir, "manifest.mjs")
    writeFileSync(moduleFile, source)

    await expect(import(moduleFile)).rejects.toThrow(/entry "no-default".*has no default export/)
  })
})
