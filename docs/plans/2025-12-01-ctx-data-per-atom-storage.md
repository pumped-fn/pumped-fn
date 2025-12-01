# ctx.data Per-Atom Private Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add lazy per-atom storage (`ctx.data`) to ResolveContext that survives invalidation but clears on release.

**Architecture:** Add optional `data?: Map<string, unknown>` field to `AtomEntry`. Expose via lazy getter on `ResolveContext`. The Map is created on first access, preserved through invalidation, cleared when atom is released.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Add data type to ResolveContext interface

**Files:**
- Modify: `packages/lite/src/types.ts:50-54`

**Step 1: Update ResolveContext interface**

In `packages/lite/src/types.ts`, find the `ResolveContext` interface and add the `data` property:

```typescript
export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void
  readonly scope: Scope
  readonly data: Map<string, unknown>
}
```

**Step 2: Run typecheck to verify interface change**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: May show errors in `scope.ts` because `ctx` doesn't have `data` yet. This is expected.

**Step 3: Commit type change**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add data property to ResolveContext interface"
```

---

## Task 2: Write failing test for ctx.data basic usage

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

**Step 1: Add test for ctx.data access**

Add this test block at the end of the `describe("Scope")` block in `packages/lite/tests/scope.test.ts`:

```typescript
describe("ctx.data", () => {
  it("provides a Map for storing data", async () => {
    const scope = await createScope()
    let capturedData: Map<string, unknown> | undefined

    const myAtom = atom({
      factory: (ctx) => {
        capturedData = ctx.data
        ctx.data.set("key", "value")
        return ctx.data.get("key")
      },
    })

    const result = await scope.resolve(myAtom)

    expect(result).toBe("value")
    expect(capturedData).toBeInstanceOf(Map)
    expect(capturedData?.get("key")).toBe("value")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- --run -t "provides a Map for storing data"`

Expected: FAIL - `ctx.data` is undefined or property doesn't exist

**Step 3: Commit failing test**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): add failing test for ctx.data basic usage"
```

---

## Task 3: Implement ctx.data in scope.ts

**Files:**
- Modify: `packages/lite/src/scope.ts:5-13` (AtomEntry interface)
- Modify: `packages/lite/src/scope.ts:232-238` (ctx creation in doResolve)

**Step 1: Add data field to AtomEntry interface**

In `packages/lite/src/scope.ts`, update the `AtomEntry` interface (around line 5-13):

```typescript
interface AtomEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  listeners: Set<() => void>
  pendingInvalidate: boolean
  data?: Map<string, unknown>
}
```

**Step 2: Add lazy data getter to ctx in doResolve**

In `packages/lite/src/scope.ts`, find the `doResolve` method and update the `ctx` object creation (around line 232-238):

```typescript
const ctx: Lite.ResolveContext = {
  cleanup: (fn) => entry.cleanups.push(fn),
  invalidate: () => {
    this.scheduleInvalidation(atom)
  },
  scope: this,
  get data() {
    if (!entry.data) {
      entry.data = new Map()
    }
    return entry.data
  },
}
```

**Step 3: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- --run -t "provides a Map for storing data"`

Expected: PASS

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 5: Commit implementation**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): implement lazy ctx.data in ResolveContext"
```

---

## Task 4: Write test for data persistence across invalidation

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

**Step 1: Add test for data surviving invalidation**

Add this test inside the `describe("ctx.data")` block:

```typescript
it("persists data across invalidations", async () => {
  const scope = await createScope()
  let resolveCount = 0

  const myAtom = atom({
    factory: (ctx) => {
      resolveCount++
      const prev = ctx.data.get("count") as number | undefined
      ctx.data.set("count", (prev ?? 0) + 1)
      return ctx.data.get("count")
    },
  })

  const first = await scope.resolve(myAtom)
  expect(first).toBe(1)

  const ctrl = scope.controller(myAtom)
  ctrl.invalidate()
  await ctrl.resolve()

  const second = ctrl.get()
  expect(second).toBe(2)
  expect(resolveCount).toBe(2)
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- --run -t "persists data across invalidations"`

Expected: PASS (data Map is preserved in AtomEntry during invalidation)

**Step 3: Commit test**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): verify ctx.data persists across invalidations"
```

---

## Task 5: Write test for data cleared on release

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

**Step 1: Add test for data cleared on release**

Add this test inside the `describe("ctx.data")` block:

```typescript
it("clears data when atom is released", async () => {
  const scope = await createScope()

  const myAtom = atom({
    factory: (ctx) => {
      const prev = ctx.data.get("count") as number | undefined
      ctx.data.set("count", (prev ?? 0) + 1)
      return ctx.data.get("count")
    },
  })

  const first = await scope.resolve(myAtom)
  expect(first).toBe(1)

  await scope.release(myAtom)

  const second = await scope.resolve(myAtom)
  expect(second).toBe(1)
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- --run -t "clears data when atom is released"`

Expected: PASS (release() deletes entire entry from cache, so data is gone)

**Step 3: Commit test**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): verify ctx.data clears on atom release"
```

---

## Task 6: Write test for lazy data creation

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

**Step 1: Add test for lazy Map creation**

Add this test inside the `describe("ctx.data")` block:

```typescript
it("creates data Map lazily on first access", async () => {
  const scope = await createScope()
  let dataAccessed = false

  const noDataAtom = atom({
    factory: () => {
      return "no data access"
    },
  })

  const withDataAtom = atom({
    factory: (ctx) => {
      dataAccessed = true
      ctx.data.set("key", "value")
      return "data accessed"
    },
  })

  await scope.resolve(noDataAtom)
  await scope.resolve(withDataAtom)

  expect(dataAccessed).toBe(true)
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- --run -t "creates data Map lazily"`

Expected: PASS

**Step 3: Commit test**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): verify ctx.data is created lazily"
```

---

## Task 7: Write test for independent data per atom

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

**Step 1: Add test for data isolation between atoms**

Add this test inside the `describe("ctx.data")` block:

```typescript
it("has independent data per atom", async () => {
  const scope = await createScope()

  const atomA = atom({
    factory: (ctx) => {
      ctx.data.set("name", "A")
      return ctx.data.get("name")
    },
  })

  const atomB = atom({
    factory: (ctx) => {
      ctx.data.set("name", "B")
      return ctx.data.get("name")
    },
  })

  const resultA = await scope.resolve(atomA)
  const resultB = await scope.resolve(atomB)

  expect(resultA).toBe("A")
  expect(resultB).toBe("B")
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- --run -t "has independent data per atom"`

Expected: PASS

**Step 3: Commit test**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): verify ctx.data is independent per atom"
```

---

## Task 8: Run full test suite and typecheck

**Files:**
- None (verification only)

**Step 1: Run all lite package tests**

Run: `pnpm -F @pumped-fn/lite test -- --run`

Expected: All tests PASS

**Step 2: Run typecheck including tests**

Run: `pnpm -F @pumped-fn/lite typecheck:full`

Expected: PASS

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`

Expected: PASS (no breaking changes to public API)

---

## Task 9: Update ADR status to accepted

**Files:**
- Modify: `.c3/adr/adr-007-resolve-context-data.md:7`

**Step 1: Update status from proposed to accepted**

Change the frontmatter:

```yaml
status: accepted
```

And update the status section:

```markdown
## Status {#adr-007-status}
**Accepted** - 2025-12-01
```

**Step 2: Commit ADR update**

```bash
git add .c3/adr/adr-007-resolve-context-data.md
git commit -m "docs(adr): accept ADR-007 ctx.data per-atom storage"
```

---

## Task 10: Final commit with all changes

**Step 1: Verify working tree is clean**

Run: `git status`

Expected: Nothing to commit, working tree clean

**Step 2: Create summary commit if needed**

If there are uncommitted changes:

```bash
git add -A
git commit -m "feat(lite): add ctx.data per-atom private storage

Adds lazy Map<string, unknown> to ResolveContext for storing data
that survives invalidation but clears on release.

- ctx.data is created lazily on first access
- Data persists across invalidations
- Data is cleared when atom is released
- Each atom has independent data storage

Implements ADR-007."
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add data to ResolveContext interface | types.ts |
| 2 | Write failing test for basic usage | scope.test.ts |
| 3 | Implement lazy ctx.data | scope.ts |
| 4 | Test data persists across invalidation | scope.test.ts |
| 5 | Test data clears on release | scope.test.ts |
| 6 | Test lazy creation | scope.test.ts |
| 7 | Test independent data per atom | scope.test.ts |
| 8 | Full test suite verification | - |
| 9 | Accept ADR-007 | adr-007-*.md |
| 10 | Final verification | - |
