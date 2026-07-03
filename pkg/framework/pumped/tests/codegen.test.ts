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
        'import e0 from "/abs/src/server/book-space.ts"',
        'import app from "/abs/src/app.ts"',
        "",
        "export { app }",
        "export const entries = [",
        '  { kind: "server", name: "book-space", file: "/abs/src/server/book-space.ts", flow: e0 }',
        "]",
        "",
      ].join("\n")
    )
  })

  it("falls back to an undefined app when there is no app.ts", () => {
    const source = generateManifest([], undefined)

    expect(source).toBe(
      ["const app = undefined", "", "export { app }", "export const entries = [", "", "]", ""].join("\n")
    )
  })
})
