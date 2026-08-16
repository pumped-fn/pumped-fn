import { describe, expect, it } from "vitest"
import { generateManifest } from "../src/codegen"

const helper = [
  'const ENTRY = Symbol.for("@pumped-fn/pumped/entry")',
  'const FLOW = Symbol.for("@pumped-fn/lite/flow")',
  "function assertEntry(value, name, file) {",
  "  if (value === undefined) {",
  '    throw new Error(`entry "${name}" in ${file} has no default export`)',
  "  }",
  '  if (typeof value === "object" && value !== null && ENTRY in value) return value',
  '  if (typeof value === "object" && value !== null && FLOW in value) {',
  '    throw new Error(`entry "${name}" in ${file} default-exports a bare flow; wrap it in entry({ flow, tags })`)',
  "  }",
  '  throw new Error(`entry "${name}" in ${file} must default-export entry({ flow, tags })`)',
  "}",
]

describe("generateManifest", () => {
  it("emits stable manifest paths and identity across checkout roots", () => {
    const first = generateManifest(
      [{ name: "book-space", file: "/first/src/entries/book-space.ts" }],
      "/first/src/apps/east.ts",
      { root: "/first", app: "east", target: "server" }
    )
    const second = generateManifest(
      [{ name: "book-space", file: "/second/src/entries/book-space.ts" }],
      "/second/src/apps/east.ts",
      { root: "/second", app: "east", target: "server" }
    )
    expect(first.source).toContain('file: "src/entries/book-space.ts"')
    expect(first.source).not.toContain('file: "/first/src/entries/book-space.ts"')
    expect(first.identity.app).toBe("east")
    expect(first.identity.target).toBe("server")
    expect(first.identity.hash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.identity).toEqual(second.identity)
    expect(first.source).toContain(`export const identity = ${JSON.stringify(first.identity)}`)
  })

  it("gives the app census and the filtered targets distinct identities", () => {
    const entries = [{ name: "book-space", file: "/abs/src/entries/book-space.ts" }]
    const census = generateManifest(entries, undefined, { root: "/abs", app: "default", target: "app" })
    const server = generateManifest(entries, undefined, { root: "/abs", app: "default", target: "server" })

    expect(census.identity.hash).not.toBe(server.identity.hash)
  })

  it("emits static imports, an assertEntry guard per entry, and an entries array", () => {
    const { source, identity } = generateManifest(
      [{ name: "book-space", file: "/abs/src/entries/book-space.ts" }],
      "/abs/src/app.ts",
      { root: "/abs", app: "default", target: "server" }
    )

    expect(source).toBe(
      [
        'import * as ns0 from "/abs/src/entries/book-space.ts"',
        'import app from "/abs/src/app.ts"',
        "",
        ...helper,
        "",
        'const e0 = assertEntry(ns0.default, "book-space", "src/entries/book-space.ts")',
        "",
        `export const identity = ${JSON.stringify(identity)}`,
        "export { app }",
        "export const entries = [",
        '  { name: "book-space", file: "src/entries/book-space.ts", entry: e0 }',
        "]",
        "",
      ].join("\n")
    )
  })

  it("falls back to an undefined app when there is no app.ts", () => {
    const { source, identity } = generateManifest([], undefined, { root: "/abs", app: "default", target: "server" })

    expect(source).toBe(
      [
        "const app = undefined",
        "",
        ...helper,
        "",
        `export const identity = ${JSON.stringify(identity)}`,
        "export { app }",
        "export const entries = [",
        "",
        "]",
        "",
      ].join("\n")
    )
  })
})
