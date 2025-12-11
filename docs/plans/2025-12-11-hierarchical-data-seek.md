# Hierarchical Data Seek Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `seek()` and `seekTag()` methods to ContextData for looking up values across ExecutionContext parent chain.

**Architecture:** Add optional `parentData` reference to `ContextDataImpl`. When `seek()`/`seekTag()` is called, check local map first, then recursively call parent's seek if not found. ExecutionContextImpl passes `this.parent?.data` when creating ContextDataImpl.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add seek() and seekTag() to ContextData interface

**Files:**
- Modify: `packages/lite/src/types.ts:65-102`

**Step 1: Add seek() method to ContextData interface**

Add after line 76 (after `clear(): void`):

```typescript
    /**
     * Look up value by key, traversing parent chain if not found locally.
     * Returns first match or undefined.
     */
    seek(key: string | symbol): unknown
```

**Step 2: Add seekTag() method to ContextData interface**

Add after the new `seek()` method:

```typescript
    /**
     * Look up tag value, traversing parent chain if not found locally.
     * Returns first match or undefined (ignores tag defaults).
     */
    seekTag<T>(tag: Tag<T, boolean>): T | undefined
```

**Step 3: Run typecheck to verify interface compiles**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: FAIL - ContextDataImpl missing seek/seekTag

**Step 4: Commit**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add seek() and seekTag() to ContextData interface"
```

---

### Task 2: Write failing tests for seek() and seekTag()

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Add test for seek() returns local value**

Add new describe block after "data isolation" tests (around line 113):

```typescript
  describe("seek() hierarchical lookup", () => {
    it("seek() returns local value if exists", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "local-value")
      expect(ctx.data.seek(KEY)).toBe("local-value")

      await ctx.close()
    })

    it("seek() returns parent value if not local", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "parent-value")

      let childSeekResult: unknown

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seek(KEY)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBe("parent-value")
      await ctx.close()
    })

    it("seek() traverses full parent chain", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "root-value")

      let grandchildSeekResult: unknown

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          grandchildSeekResult = grandchildCtx.data.seek(KEY)
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(grandchildSeekResult).toBe("root-value")
      await ctx.close()
    })

    it("seek() returns undefined if not in any context", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("missing")

      let childSeekResult: unknown = "not-undefined"

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seek(KEY)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBeUndefined()
      await ctx.close()
    })

    it("seek() prefers local over parent", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "parent-value")

      let childSeekResult: unknown

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childCtx.data.set(KEY, "child-value")
            childSeekResult = childCtx.data.seek(KEY)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBe("child-value")
      await ctx.close()
    })
  })
```

**Step 2: Add test for seekTag()**

Add after the seek() tests:

```typescript
  describe("seekTag() hierarchical lookup", () => {
    it("seekTag() returns parent tag value", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const testTag = tag<string>({ label: "test" })

      ctx.data.setTag(testTag, "parent-tag-value")

      let childSeekResult: string | undefined

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seekTag(testTag)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBe("parent-tag-value")
      await ctx.close()
    })

    it("seekTag() does NOT use tag default", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const tagWithDefault = tag<number>({ label: "count", defaultValue: 42 })

      let childSeekResult: number | undefined = 999

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seekTag(tagWithDefault)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBeUndefined()
      await ctx.close()
    })

    it("seekTag() traverses grandparent chain", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const userTag = tag<{ id: string }>({ label: "user" })

      ctx.data.setTag(userTag, { id: "root-user" })

      let grandchildResult: { id: string } | undefined

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          grandchildResult = grandchildCtx.data.seekTag(userTag)
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(grandchildResult).toEqual({ id: "root-user" })
      await ctx.close()
    })
  })
```

**Step 3: Add import for tag at top of file**

Modify imports at top of file:

```typescript
import { createScope } from "../src/scope"
import { flow } from "../src/flow"
import { tag } from "../src/tag"
import { type Lite } from "../src/types"
```

**Step 4: Run tests to verify they fail**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: FAIL - seek/seekTag not implemented

**Step 5: Commit**

```bash
git add packages/lite/tests/hierarchical-context.test.ts
git commit -m "test(lite): add failing tests for seek() and seekTag()"
```

---

### Task 3: Implement seek() and seekTag() in ContextDataImpl

**Files:**
- Modify: `packages/lite/src/scope.ts:8-60`

**Step 1: Add parentData constructor parameter to ContextDataImpl**

Replace the ContextDataImpl class (lines 8-60) with:

```typescript
class ContextDataImpl implements Lite.ContextData {
  private readonly map = new Map<string | symbol, unknown>()

  constructor(
    private readonly parentData?: Lite.ContextData
  ) {}

  // Raw Map operations
  get(key: string | symbol): unknown {
    return this.map.get(key)
  }

  set(key: string | symbol, value: unknown): void {
    this.map.set(key, value)
  }

  has(key: string | symbol): boolean {
    return this.map.has(key)
  }

  delete(key: string | symbol): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  seek(key: string | symbol): unknown {
    if (this.map.has(key)) {
      return this.map.get(key)
    }
    return this.parentData?.seek(key)
  }

  // Tag-based operations
  getTag<T>(tag: Lite.Tag<T, boolean>): T | undefined {
    return this.map.get(tag.key) as T | undefined
  }

  setTag<T>(tag: Lite.Tag<T, boolean>, value: T): void {
    this.map.set(tag.key, value)
  }

  hasTag<T, H extends boolean>(tag: Lite.Tag<T, H>): boolean {
    return this.map.has(tag.key)
  }

  deleteTag<T, H extends boolean>(tag: Lite.Tag<T, H>): boolean {
    return this.map.delete(tag.key)
  }

  seekTag<T>(tag: Lite.Tag<T, boolean>): T | undefined {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    return this.parentData?.seekTag(tag)
  }

  getOrSetTag<T>(tag: Lite.Tag<T, true>): T
  getOrSetTag<T>(tag: Lite.Tag<T, true>, value: T): T
  getOrSetTag<T>(tag: Lite.Tag<T, false>, value: T): T
  getOrSetTag<T>(tag: Lite.Tag<T, boolean>, value?: T): T {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    const storedValue = value !== undefined ? value : (tag.defaultValue as T)
    this.map.set(tag.key, storedValue)
    return storedValue
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: PASS

**Step 3: Run tests (still failing - ExecutionContextImpl not passing parentData yet)**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: FAIL - parentData not being passed

**Step 4: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): implement seek() and seekTag() in ContextDataImpl"
```

---

### Task 4: Pass parentData in ExecutionContextImpl

**Files:**
- Modify: `packages/lite/src/scope.ts:723-728`

**Step 1: Update data getter in ExecutionContextImpl**

Replace the `get data()` getter (around line 723-728):

```typescript
  get data(): Lite.ContextData {
    if (!this._data) {
      this._data = new ContextDataImpl(this.parent?.data)
    }
    return this._data
  }
```

**Step 2: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/lite test hierarchical-context`
Expected: PASS

**Step 3: Run full test suite**

Run: `pnpm -F @pumped-fn/lite test`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): pass parentData to ContextDataImpl in ExecutionContext"
```

---

### Task 5: Update C3 documentation

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md`

**Step 1: Add Hierarchical Data Lookup section**

Add after the "Isolated Data Maps" section (around line 417):

```markdown
### Hierarchical Data Lookup with seek()

While each context has isolated data (`get()`/`getTag()` only read local), you can traverse the parent chain using `seek()`:

```typescript
const requestIdTag = tag<string>({ label: "requestId" })

const middleware = flow({
  factory: async (ctx) => {
    ctx.data.setTag(requestIdTag, generateRequestId())
    return ctx.exec({ flow: handler })
  }
})

const handler = flow({
  factory: (ctx) => {
    // seekTag() finds value from parent middleware context
    const reqId = ctx.data.seekTag(requestIdTag)
    logger.info(`Request: ${reqId}`)
  }
})
```

**Behavior comparison:**

| Method | Scope | Use Case |
|--------|-------|----------|
| `getTag(tag)` | Local only | Per-exec isolated data |
| `seekTag(tag)` | Local → parent → ... → root | Cross-cutting concerns |
| `setTag(tag, v)` | Local only | Always writes to current context |

**Note:** `seekTag()` does NOT use tag defaults - it's a pure lookup. Returns `undefined` if not found in any context.
```

**Step 2: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): add seek() documentation to c3-203"
```

---

### Task 6: Update ADR status and run audit

**Files:**
- Modify: `.c3/adr/adr-021-hierarchical-data-seek.md`

**Step 1: Update ADR status to Accepted**

Change line 8-9:

```yaml
status: accepted
```

And update the Status section:

```markdown
## Status {#adr-021-status}
**Accepted** - 2025-12-11
```

**Step 2: Run C3 audit**

Run: `/c3-skill:c3-audit`

**Step 3: Regenerate TOC**

Run: `.c3/scripts/build-toc.sh`

**Step 4: Commit**

```bash
git add .c3/
git commit -m "docs(adr): accept ADR-021 hierarchical data seek"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 3: Run build**

Run: `pnpm --filter @pumped-fn/lite build`
Expected: Build succeeds

**Step 4: Commit any remaining changes**

```bash
git status
# If any unstaged changes:
git add .
git commit -m "chore(lite): final cleanup for ADR-021"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add interface methods | `types.ts` |
| 2 | Write failing tests | `hierarchical-context.test.ts` |
| 3 | Implement seek methods | `scope.ts` (ContextDataImpl) |
| 4 | Pass parentData | `scope.ts` (ExecutionContextImpl) |
| 5 | Update C3 docs | `c3-203-flow.md` |
| 6 | Accept ADR, audit | `adr-021-*.md` |
| 7 | Final verification | - |
