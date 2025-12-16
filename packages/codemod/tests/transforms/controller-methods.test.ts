import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import jscodeshift from "jscodeshift"
import { transformControllerMethods } from "../../src/transforms/controller-methods"

const fixtureDir = resolve(__dirname, "../fixtures")

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), "utf-8")
}

function transform(source: string) {
  const j = jscodeshift.withParser("tsx")
  const root = j(source)
  transformControllerMethods(j, root)
  return root.toSource()
}

describe("transformControllerMethods", () => {
  it("transforms controller method calls using fixtures", () => {
    const input = loadFixture("controller-methods.input.ts")
    const expected = loadFixture("controller-methods.output.ts")

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms ctx.release() to ctx.invalidate()", () => {
    const input = `const a = provide((ctx) => {
  ctx.release()
  return 42
})`
    const expected = `const a = provide((ctx) => {
  ctx.invalidate()
  return 42
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("transforms ctx.reload() to ctx.invalidate()", () => {
    const input = `const a = provide((ctx) => {
  ctx.reload()
  return 42
})`
    const expected = `const a = provide((ctx) => {
  ctx.invalidate()
  return 42
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("preserves ctx.cleanup() calls", () => {
    const input = `const a = provide((ctx) => {
  ctx.cleanup(() => console.log('cleanup'))
  return 42
})`

    const code = transform(input)

    expect(code.trim()).toBe(input.trim())
  })

  it("preserves ctx.scope property access", () => {
    const input = `const a = provide((ctx) => {
  return ctx.scope.resolve(dep)
})`

    const code = transform(input)

    expect(code.trim()).toBe(input.trim())
  })

  it("transforms multiple method calls in one function", () => {
    const input = `const a = provide((ctx) => {
  ctx.cleanup(() => {})
  ctx.release()
  ctx.reload()
  return ctx.scope.resolve(dep)
})`
    const expected = `const a = provide((ctx) => {
  ctx.cleanup(() => {})
  ctx.invalidate()
  ctx.invalidate()
  return ctx.scope.resolve(dep)
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })

  it("does not transform shadowed ctx in nested functions", () => {
    const input = `const a = provide((ctx) => {
  const inner = (ctx) => ctx.release();
  ctx.reload()
  return 42
})`
    const expected = `const a = provide((ctx) => {
  const inner = (ctx) => ctx.release();
  ctx.invalidate()
  return 42
})`

    const code = transform(input)

    expect(code.trim()).toBe(expected.trim())
  })
})
