import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import jscodeshift from "jscodeshift"
import { transformImports } from "../../src/transforms/imports"

const fixtureDir = resolve(__dirname, "../fixtures")

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), "utf-8")
}

function transform(source: string) {
  const j = jscodeshift.withParser("tsx")
  const root = j(source)
  const result = transformImports(j, root)
  return {
    code: root.toSource(),
    ...result,
  }
}

describe("transformImports", () => {
  it("transforms basic imports from core-next to lite", () => {
    const input = loadFixture("imports-basic.input.ts")
    const expected = loadFixture("imports-basic.output.ts")

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("deduplicates provide and derive to atom", () => {
    const input = loadFixture("imports-dedup.input.ts")
    const expected = loadFixture("imports-dedup.output.ts")

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms createScope and preset", () => {
    const input = loadFixture("imports-scope.input.ts")
    const expected = loadFixture("imports-scope.output.ts")

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("preserves extension import unchanged", () => {
    const input = loadFixture("imports-extension.input.ts")
    const expected = loadFixture("imports-extension.output.ts")

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("returns addedController: false when no controller is added", () => {
    const input = loadFixture("imports-basic.input.ts")

    const { addedController } = transform(input)

    expect(addedController).toBe(false)
  })

  it("does not modify non-core-next imports", () => {
    const input = `import { foo } from "other-package"`

    const { code } = transform(input)

    expect(code.trim()).toBe(input.trim())
  })

  it("handles mixed value and type imports", () => {
    const input = `import { provide, type Core } from "@pumped-fn/core-next"`
    const expected = `import { atom, type Lite } from "@pumped-fn/lite"`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })
})
