import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import jscodeshift from "jscodeshift"
import { transformTypes } from "../../src/transforms/types"

const fixtureDir = resolve(__dirname, "../fixtures")

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), "utf-8")
}

function transform(source: string, fileName?: string) {
  const j = jscodeshift.withParser("tsx")
  const root = j(source)
  const edgeCases = transformTypes(j, root, fileName)
  return { code: root.toSource(), edgeCases }
}

describe("transformTypes", () => {
  it("transforms Core.Executor to Lite.Atom", () => {
    const input = `type MyExecutor = Core.Executor<string>`
    const expected = `type MyExecutor = Lite.Atom<string>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Core.Controller to Lite.ResolveContext", () => {
    const input = `type MyController = Core.Controller`
    const expected = `type MyController = Lite.ResolveContext`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Core.Accessor to Lite.Controller", () => {
    const input = `type MyAccessor = Core.Accessor<number>`
    const expected = `type MyAccessor = Lite.Controller<number>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Core.Lazy to Lite.ControllerDep", () => {
    const input = `type MyLazy = Core.Lazy<boolean>`
    const expected = `type MyLazy = Lite.ControllerDep<boolean>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Core.Reactive to Lite.ControllerDep", () => {
    const input = `type MyReactive = Core.Reactive<Config>`
    const expected = `type MyReactive = Lite.ControllerDep<Config>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("does NOT transform Core.Static and returns EdgeCase", () => {
    const input = `type MyStatic = Core.Static<User>`
    const expected = `type MyStatic = Core.Static<User>`

    const { code, edgeCases } = transform(input, "test.ts")

    expect(code.trim()).toBe(expected.trim())
    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0]).toMatchObject({
      file: "test.ts",
      category: "type_no_equivalent",
      pattern: "Core.Static",
    })
  })

  it("transforms Core.Preset to Lite.Preset", () => {
    const input = `type MyPreset = Core.Preset<Database>`
    const expected = `type MyPreset = Lite.Preset<Database>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Core.AnyExecutor to Lite.Atom<unknown>", () => {
    const input = `type MyAnyExecutor = Core.AnyExecutor`
    const expected = `type MyAnyExecutor = Lite.Atom<unknown>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Tag.Tag to Lite.Tag", () => {
    const input = `type MyTag = Tag.Tag<string>`
    const expected = `type MyTag = Lite.Tag<string>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Tag.Tagged to Lite.Tagged", () => {
    const input = `type MyTagged = Tag.Tagged<number>`
    const expected = `type MyTagged = Lite.Tagged<number>`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms Tag.Source to Lite.TagSource", () => {
    const input = `type MyTagSource = Tag.Source`
    const expected = `type MyTagSource = Lite.TagSource`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms complete fixture file", () => {
    const input = loadFixture("types-core.input.ts")
    const expected = loadFixture("types-core.output.ts")

    const { code, edgeCases } = transform(input, "fixture.ts")

    expect(code.trim()).toBe(expected.trim())
    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0].pattern).toBe("Core.Static")
  })

  it("handles missing fileName gracefully", () => {
    const input = `type MyStatic = Core.Static<User>`

    const { edgeCases } = transform(input)

    expect(edgeCases).toHaveLength(1)
    expect(edgeCases[0].file).toBe("unknown")
  })

  it("provides useful context in EdgeCase", () => {
    const input = `type SessionAccessor = Core.Static<UserSession>`

    const { edgeCases } = transform(input, "auth.ts")

    expect(edgeCases[0]).toMatchObject({
      pattern: "Core.Static",
      context: "type SessionAccessor = Core.Static<UserSession>",
      suggestion: "No equivalent in lite - controller() provides lazy behavior by default",
    })
  })

  it("does not modify unrelated types", () => {
    const input = `type MyType = SomeOther.Type<string>`

    const { code, edgeCases } = transform(input)

    expect(code.trim()).toBe(input.trim())
    expect(edgeCases).toHaveLength(0)
  })

  it("handles multiple type transforms in one file", () => {
    const input = `
type A = Core.Executor<string>
type B = Tag.Tag<number>
type C = Core.Accessor<boolean>
`
    const expected = `
type A = Lite.Atom<string>
type B = Lite.Tag<number>
type C = Lite.Controller<boolean>
`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms types in interfaces", () => {
    const input = `
interface Service {
  exec: Core.Executor<Data>
  tag: Tag.Tag<Value>
}
`
    const expected = `
interface Service {
  exec: Lite.Atom<Data>
  tag: Lite.Tag<Value>
}
`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms types in class properties", () => {
    const input = `
class MyClass {
  private executor: Core.Executor<Config>
  private accessor: Core.Accessor<State>
}
`
    const expected = `
class MyClass {
  private executor: Lite.Atom<Config>
  private accessor: Lite.Controller<State>
}
`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms types in function return types", () => {
    const input = `function getExecutor(): Core.Executor<Data> { return null as any }`
    const expected = `function getExecutor(): Lite.Atom<Data> { return null as any }`

    const { code } = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })
})
