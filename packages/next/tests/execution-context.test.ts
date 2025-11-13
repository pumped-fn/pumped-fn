import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { tag } from "../src/tag"
import { custom } from "../src/ssch"

describe("ExecutionContext", () => {
  it("creates execution context with details", () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test-ctx" })

    expect(ctx.id).toBeDefined()
    expect(ctx.details.name).toBe("test-ctx")
    expect(ctx.details.startedAt).toBeGreaterThan(0)
    expect(ctx.parent).toBeUndefined()
  })

  it("creates child context via exec", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "parent" })

    let childCtx: any
    const result = await ctx.exec("child", (c) => {
      childCtx = c
      expect(c.parent).toBe(ctx)
      expect(c.details.name).toBe("child")
      return "result"
    })

    expect(childCtx.parent).toBe(ctx)
    expect(result).toBe("result")
  })

  it("inherits tags from parent", () => {
    const scope = createScope()
    const requestIdTag = tag(custom<string>(), { label: "requestId" })
    const ctx = scope.createExecution({ name: "parent" })

    ctx.set(requestIdTag, "req-123")

    ctx.exec("child", (childCtx) => {
      const requestId = childCtx.get(requestIdTag)
      expect(requestId).toBe("req-123")
    })
  })

  it("child tags override parent tags", () => {
    const scope = createScope()
    const nameTag = tag(custom<string>(), { label: "name" })
    const ctx = scope.createExecution({ name: "parent" })

    ctx.set(nameTag, "parent-name")

    ctx.exec("child", (childCtx) => {
      childCtx.set(nameTag, "child-name")
      expect(childCtx.get(nameTag)).toBe("child-name")
      expect(ctx.get(nameTag)).toBe("parent-name")
    })
  })

  it("marks context as ended", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test" })

    expect(ctx.details.completedAt).toBeUndefined()
    ctx.end()
    expect(ctx.details.completedAt).toBeDefined()
  })

  it("tracks execution errors", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "parent" })

    try {
      await ctx.exec("failing", () => {
        throw new Error("test error")
      })
    } catch (error) {
      // Expected
    }

    // Child context should have error recorded
  })

  it("supports abort signal", () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test" })

    expect(ctx.signal.aborted).toBe(false)
    expect(() => ctx.throwIfAborted()).not.toThrow()
  })
})
