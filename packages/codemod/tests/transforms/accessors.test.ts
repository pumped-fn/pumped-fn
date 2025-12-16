import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import jscodeshift from "jscodeshift"
import { transformAccessors } from "../../src/transforms/accessors"

const fixtureDir = resolve(__dirname, "../fixtures")

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), "utf-8")
}

function transform(source: string, fileName?: string) {
  const j = jscodeshift.withParser("tsx")
  const root = j(source)
  const edgeCases = transformAccessors(j, root, fileName)
  return { code: root.toSource(), edgeCases }
}

describe("transformAccessors", () => {
  it("transforms .lazy to controller()", () => {
    const input = `const lazyDb = dbAtom.lazy`
    const expected = `const lazyDb = controller(dbAtom)`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms .reactive to controller()", () => {
    const input = `const reactiveConfig = configAtom.reactive`
    const expected = `const reactiveConfig = controller(configAtom)`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms .static to controller() with warning", () => {
    const input = `const staticUser = userAtom.static`
    const expected = `const staticUser = controller(userAtom)`

    const { code, edgeCases } = transform(input, "test.ts")

    expect(code.trim()).toBe(expected.trim())
    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0].category).toBe("static_accessor")
  })

  it("returns EdgeCase for .static usage", () => {
    const input = `const staticValue = atom.static`

    const { edgeCases } = transform(input, "example.ts")

    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0]).toMatchObject({
      file: "example.ts",
      category: "static_accessor",
      pattern: ".static",
    })
  })

  it("does not modify unrelated member expressions", () => {
    const input = `const value = someObject.property`

    const { code, edgeCases } = transform(input)

    expect(code.trim()).toBe(input.trim())
    expect(edgeCases).toHaveLength(0)
  })

  it("transforms multiple accessor patterns in one file", () => {
    const input = loadFixture("accessor-lazy.input.ts")
    const expected = loadFixture("accessor-lazy.output.ts")

    const { code, edgeCases } = transform(input, "test.ts")

    expect(code.trim()).toBe(expected.trim())
    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0].category).toBe("static_accessor")
  })

  it("handles missing fileName gracefully", () => {
    const input = `const staticValue = atom.static`

    const { edgeCases } = transform(input)

    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0].file).toBe("unknown")
  })

  it("provides useful context in EdgeCase", () => {
    const input = `const staticValue = userAtom.static`

    const { edgeCases } = transform(input, "test.ts")

    expect(edgeCases[0]).toMatchObject({
      pattern: ".static",
      context: "const staticValue = userAtom.static",
    })
  })
})
