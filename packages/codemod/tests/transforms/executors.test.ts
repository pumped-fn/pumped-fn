import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import jscodeshift from "jscodeshift"
import { transformProvide } from "../../src/transforms/executors"

const fixtureDir = resolve(__dirname, "../fixtures")

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), "utf-8")
}

function transform(source: string) {
  const j = jscodeshift.withParser("tsx")
  const root = j(source)
  transformProvide(j, root)
  return root.toSource()
}

describe("transformProvide", () => {
  it("transforms basic provide calls to atom with factory", () => {
    const input = loadFixture("provide-basic.input.ts")
    const expected = loadFixture("provide-basic.output.ts")

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms provide with tags to atom with factory and tags array", () => {
    const input = loadFixture("provide-tags.input.ts")
    const expected = loadFixture("provide-tags.output.ts")

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("renames ctl parameter to ctx", () => {
    const input = `const a = provide((ctl) => ctl.resolve(dep))`
    const expected = `const a = atom({
  factory: (ctx) => ctx.resolve(dep)
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("renames controller parameter to ctx", () => {
    const input = `const a = provide((controller) => controller.resolve(dep))`
    const expected = `const a = atom({
  factory: (ctx) => ctx.resolve(dep)
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("does not modify non-provide calls", () => {
    const input = `const x = otherFunction((ctl) => 42)`

    const code = transform(input)

    expect(code.trim()).toBe(input.trim())
  })

  it("preserves shadowed parameter names in nested functions", () => {
    const input = `const a = provide((ctl) => {
  const inner = (ctl) => ctl + 1;
  return ctl.resolve(dep);
})`
    const expected = `const a = atom({
  factory: (ctx) => {
    const inner = (ctl) => ctl + 1;
    return ctx.resolve(dep);
  }
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("preserves shadowed parameter in nested arrow functions", () => {
    const input = `const a = provide((controller) => {
  const callback = (controller) => controller.getData();
  return controller.resolve(dep);
})`
    const expected = `const a = atom({
  factory: (ctx) => {
    const callback = (controller) => controller.getData();
    return ctx.resolve(dep);
  }
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })
})
