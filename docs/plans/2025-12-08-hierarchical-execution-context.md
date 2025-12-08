# Hierarchical ExecutionContext Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create child ExecutionContext per `exec()` call with parent reference and isolated data map for nested span tracing.

**Architecture:** Each `ctx.exec()` creates a child context with `parent` reference and own `data` Map. Child auto-closes after exec completes. Extensions access parent chain via `ctx.parent.data`.

**Tech Stack:** TypeScript, Vitest, pnpm

**Reference:** `.c3/adr/adr-016-hierarchical-execution-context.md`

---

## Task 1: Add Interface Properties

**Files:**
- Modify: `packages/lite/src/types.ts:103-110`

**Step 1: Add parent and data to ExecutionContext interface**

```typescript
export interface ExecutionContext {
  readonly input: unknown
  readonly scope: Scope
  readonly parent: ExecutionContext | undefined
  readonly data: Map<symbol, unknown>
  exec<Output, Input>(options: ExecFlowOptions<Output, Input>): Promise<Output>
  exec<Output, Args extends unknown[]>(options: ExecFnOptions<Output, Args>): Promise<Output>
  onClose(fn: () => MaybePromise<void>): void
  close(): Promise<void>
}
```

**Step 2: Typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: FAIL (ExecutionContextImpl missing parent/data)

---

## Task 2: Add Fields to ExecutionContextImpl

**Files:**
- Modify: `packages/lite/src/scope.ts:661-675`

**Step 1: Update constructor and add fields**

Replace the ExecutionContextImpl class declaration and constructor:

```typescript
class ExecutionContextImpl implements Lite.ExecutionContext {
  private cleanups: (() => MaybePromise<void>)[] = []
  private closed = false
  private _input: unknown = undefined
  private readonly baseTags: Lite.Tagged<unknown>[]
  private _data: Map<symbol, unknown> | undefined
  readonly parent: Lite.ExecutionContext | undefined

  constructor(
    readonly scope: ScopeImpl,
    options?: Lite.CreateContextOptions & {
      parent?: Lite.ExecutionContext
      input?: unknown
    }
  ) {
    this.parent = options?.parent
    this._input = options?.input
    const ctxTags = options?.tags
    this.baseTags = ctxTags?.length
      ? [...ctxTags, ...scope.tags]
      : scope.tags
  }

  get input(): unknown {
    return this._input
  }

  get data(): Map<symbol, unknown> {
    if (!this._data) {
      this._data = new Map()
    }
    return this._data
  }
```

**Step 2: Typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: PASS

---

## Task 3: Test Parent Chain

**Files:**
- Create: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Write failing test for parent reference**

```typescript
import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { flow } from "../src/flow"

describe("Hierarchical ExecutionContext", () => {
  describe("parent chain", () => {
    it("root context has undefined parent", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      expect(ctx.parent).toBeUndefined()
      await ctx.close()
    })

    it("child context has parent reference", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let childParent: unknown

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childParent = childCtx.parent
          }
        }),
        input: null
      })

      expect(childParent).toBe(ctx)
      await ctx.close()
    })

    it("grandchild has correct parent chain", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const parents: unknown[] = []

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          parents.push(grandchildCtx.parent?.parent)
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          parents.push(childCtx.parent)
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(parents[0]).toBe(ctx)
      expect(parents[1]).toBe(ctx)
      await ctx.close()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: FAIL (child context is same as parent, not new instance)

---

## Task 4: Implement Child Context Creation in exec()

**Files:**
- Modify: `packages/lite/src/scope.ts:681-696`

**Step 1: Replace exec() to create child context**

```typescript
async exec(options: {
  flow: Lite.Flow<unknown, unknown>
  input?: unknown
  name?: string
  tags?: Lite.Tagged<unknown>[]
} | Lite.ExecFnOptions<unknown>): Promise<unknown> {
  if (this.closed) {
    throw new Error("ExecutionContext is closed")
  }

  const childCtx = new ExecutionContextImpl(this.scope, {
    parent: this,
    tags: this.baseTags
  })

  try {
    if ("flow" in options) {
      return await childCtx.execFlowInternal(options)
    } else {
      return await childCtx.execFnInternal(options)
    }
  } finally {
    await childCtx.close()
  }
}
```

**Step 2: Rename execFlow to execFlowInternal**

Find `private async execFlow` and rename to `private async execFlowInternal`.

**Step 3: Rename execFn to execFnInternal**

Find `private execFn` and rename to `private async execFnInternal`.

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

**Step 5: Run full test suite**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All tests PASS

---

## Task 5: Test Isolated Data Maps

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Add data isolation tests**

```typescript
describe("data isolation", () => {
  it("each context has own data map", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const KEY = Symbol("test")

    ctx.data.set(KEY, "root")

    let childData: string | undefined

    await ctx.exec({
      flow: flow({
        factory: (childCtx) => {
          childData = childCtx.data.get(KEY) as string | undefined
          childCtx.data.set(KEY, "child")
        }
      }),
      input: null
    })

    expect(ctx.data.get(KEY)).toBe("root")
    expect(childData).toBeUndefined()
    await ctx.close()
  })

  it("data map is lazy", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    let accessed = false
    const originalGet = Map.prototype.get

    await ctx.exec({
      flow: flow({
        factory: () => {
          accessed = true
        }
      }),
      input: null
    })

    await ctx.close()
  })

  it("concurrent execs have isolated data", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const KEY = Symbol("test")

    const results: string[] = []

    const testFlow = flow({
      factory: async (childCtx) => {
        const id = childCtx.input as string
        childCtx.data.set(KEY, id)
        await new Promise(r => setTimeout(r, 10))
        results.push(childCtx.data.get(KEY) as string)
      }
    })

    await Promise.all([
      ctx.exec({ flow: testFlow, input: "A" }),
      ctx.exec({ flow: testFlow, input: "B" })
    ])

    expect(results).toContain("A")
    expect(results).toContain("B")
    await ctx.close()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

---

## Task 6: Test Input Isolation

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Add input isolation tests**

```typescript
describe("input isolation", () => {
  it("root context has undefined input", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    expect(ctx.input).toBeUndefined()
    await ctx.close()
  })

  it("each exec has isolated input", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const inputs: unknown[] = []

    const captureFlow = flow({
      factory: (childCtx) => {
        inputs.push(childCtx.input)
      }
    })

    await ctx.exec({ flow: captureFlow, input: "first" })
    await ctx.exec({ flow: captureFlow, input: "second" })

    expect(inputs).toEqual(["first", "second"])
    expect(ctx.input).toBeUndefined()
    await ctx.close()
  })

  it("concurrent execs have correct input", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const inputs: string[] = []

    const captureFlow = flow({
      factory: async (childCtx) => {
        await new Promise(r => setTimeout(r, 10))
        inputs.push(childCtx.input as string)
      }
    })

    await Promise.all([
      ctx.exec({ flow: captureFlow, input: "A" }),
      ctx.exec({ flow: captureFlow, input: "B" })
    ])

    expect(inputs.sort()).toEqual(["A", "B"])
    await ctx.close()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

---

## Task 7: Test Cleanup Lifecycle

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Add cleanup lifecycle tests**

```typescript
describe("cleanup lifecycle", () => {
  it("child cleanup runs on exec completion", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const events: string[] = []

    await ctx.exec({
      flow: flow({
        factory: (childCtx) => {
          childCtx.onClose(() => events.push("child-cleanup"))
        }
      }),
      input: null
    })

    events.push("after-exec")
    await ctx.close()
    events.push("after-root-close")

    expect(events).toEqual(["child-cleanup", "after-exec", "after-root-close"])
  })

  it("nested cleanups run in correct order", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const events: string[] = []

    const innerFlow = flow({
      factory: (grandchildCtx) => {
        grandchildCtx.onClose(() => events.push("grandchild"))
      }
    })

    const outerFlow = flow({
      factory: async (childCtx) => {
        childCtx.onClose(() => events.push("child"))
        await childCtx.exec({ flow: innerFlow, input: null })
        events.push("after-inner-exec")
      }
    })

    await ctx.exec({ flow: outerFlow, input: null })
    events.push("after-outer-exec")

    expect(events).toEqual([
      "grandchild",
      "after-inner-exec",
      "child",
      "after-outer-exec"
    ])
    await ctx.close()
  })

  it("double close is no-op", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    let cleanupCount = 0

    await ctx.exec({
      flow: flow({
        factory: (childCtx) => {
          childCtx.onClose(() => cleanupCount++)
        }
      }),
      input: null
    })

    expect(cleanupCount).toBe(1)
    await ctx.close()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

---

## Task 8: Test Closed Context Throws

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Add closed context test**

```typescript
describe("closed context", () => {
  it("exec on closed child throws", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    let capturedCtx: Lite.ExecutionContext | undefined

    await ctx.exec({
      flow: flow({
        factory: (childCtx) => {
          capturedCtx = childCtx
        }
      }),
      input: null
    })

    await expect(
      capturedCtx!.exec({ flow: flow({ factory: () => {} }), input: null })
    ).rejects.toThrow("ExecutionContext is closed")

    await ctx.close()
  })

  it("data and parent accessible on closed context", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const KEY = Symbol("test")

    let capturedCtx: Lite.ExecutionContext | undefined

    await ctx.exec({
      flow: flow({
        factory: (childCtx) => {
          childCtx.data.set(KEY, "value")
          capturedCtx = childCtx
        }
      }),
      input: null
    })

    expect(capturedCtx!.data.get(KEY)).toBe("value")
    expect(capturedCtx!.parent).toBe(ctx)
    await ctx.close()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

---

## Task 9: Test Extension Receives Child Context

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Add extension test**

```typescript
describe("extension integration", () => {
  it("wrapExec receives child context", async () => {
    const SPAN_KEY = Symbol("span")
    const contexts: Lite.ExecutionContext[] = []

    const tracingExtension: Lite.Extension = {
      name: "tracing",
      wrapExec: async (next, target, ctx) => {
        contexts.push(ctx)
        const parentSpan = ctx.parent?.data.get(SPAN_KEY)
        ctx.data.set(SPAN_KEY, { parent: parentSpan, id: contexts.length })
        return next()
      }
    }

    const scope = createScope({ extensions: [tracingExtension] })
    const ctx = scope.createContext()

    const innerFlow = flow({ factory: () => {} })
    const outerFlow = flow({
      factory: async (childCtx) => {
        await childCtx.exec({ flow: innerFlow, input: null })
      }
    })

    await ctx.exec({ flow: outerFlow, input: null })

    expect(contexts).toHaveLength(2)
    expect(contexts[0]!.parent).toBe(ctx)
    expect(contexts[1]!.parent).toBe(contexts[0])

    const span1 = contexts[0]!.data.get(SPAN_KEY) as { parent: unknown; id: number }
    const span2 = contexts[1]!.data.get(SPAN_KEY) as { parent: unknown; id: number }

    expect(span1.parent).toBeUndefined()
    expect(span2.parent).toEqual(span1)

    await ctx.close()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

---

## Task 10: Run Full Test Suite and Typecheck

**Step 1: Run typecheck including tests**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/lite/src/types.ts packages/lite/src/scope.ts packages/lite/tests/hierarchical-context.test.ts
git commit -m "feat(lite): add hierarchical ExecutionContext with parent-child per exec

- Add parent and data properties to ExecutionContext interface
- Create child context per exec() call with auto-close
- Each child has isolated data Map and input
- Extensions receive child context in wrapExec
- Enables nested span tracing without AsyncLocalStorage

BREAKING CHANGE: onClose() callbacks now run when exec completes (child auto-close),
not when root context is manually closed.

Refs: ADR-016"
```

---

## Task 11: Update C3 Documentation

**Step 1: Run C3 audit**

Run: `/c3-skill:c3-audit`

Follow audit recommendations to update:
- `c3-203` (Flow & ExecutionContext)
- `c3-201` (Scope & Controller)
- `c3-2` (Lite Extension System)

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `pnpm -F @pumped-fn/lite typecheck:full` passes
- [ ] `pnpm -F @pumped-fn/lite test` all pass
- [ ] Parent chain works: root → child → grandchild
- [ ] Data maps are isolated per exec
- [ ] Input is isolated per exec
- [ ] Cleanups run on exec completion
- [ ] Closed child throws on exec()
- [ ] Extension receives child context with parent access
- [ ] Concurrent execs don't race
