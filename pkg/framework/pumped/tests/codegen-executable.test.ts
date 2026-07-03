import { Parser } from "acorn"
import { describe, expect, it } from "vitest"
import { generateManifest } from "../src/codegen"

describe("generateManifest output", () => {
  it("parses as plain ECMAScript with no TypeScript-only syntax", () => {
    const source = generateManifest(
      [{ kind: "server", name: "book-space", file: "/abs/src/server/book-space.ts" }],
      "/abs/src/app.ts"
    )

    expect(() => Parser.parse(source, { ecmaVersion: "latest", sourceType: "module" })).not.toThrow()
    expect(source).not.toMatch(/\bas const\b/)
  })

  it("parses as plain ECMAScript with no app.ts present", () => {
    const source = generateManifest([], undefined)

    expect(() => Parser.parse(source, { ecmaVersion: "latest", sourceType: "module" })).not.toThrow()
    expect(source).not.toMatch(/\bas const\b/)
  })
})
