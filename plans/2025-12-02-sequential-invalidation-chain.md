# Sequential Invalidation Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace parallel fire-and-forget invalidation with sequential awaited chain, add infinite loop detection, and guarantee deterministic frame control.

**Architecture:** Add `invalidationChain` (Set for loop detection) and `chainPromise` (Promise for joining) to ScopeImpl. Replace `queueMicrotask` + fire-and-forget pattern with a single microtask that processes the entire chain sequentially via `await`. Self-invalidation during factory remains deferred via existing `pendingInvalidate` flag.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Add Frame Control Test

**Files:**
- Create: `packages/lite/tests/invalidation-chain.test.ts`

**Step 1: Create the test file with frame control test**

```typescript
import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"

describe("invalidation chain", () => {
  it("executes in exactly 3 frames: trigger, chain, settle", async () => {
    const frames: string[][] = []
    let frameIndex = 0

    const track = (label: string) => {
      frames[frameIndex] ??= []
      frames[frameIndex].push(label)
    }

    const advanceFrame = async () => {
      frameIndex++
      frames[frameIndex] ??= []
      await Promise.resolve()
    }

    const atomA = atom({ factory: () => { track("A"); return "a" } })
    const atomB = atom({
      deps: { a: controller(atomA) },
      factory: (ctx, { a }) => {
        a.on("resolved", () => ctx.invalidate())
        track("B")
        return "b"
      },
    })
    const atomC = atom({
      deps: { b: controller(atomB) },
      factory: (ctx, { b }) => {
        b.on("resolved", () => ctx.invalidate())
        track("C")
        return "c"
      },
    })

    const scope = createScope()
    await scope.resolve(atomC)

    frames.length = 0
    frameIndex = 0
    frames[0] = []

    track("trigger")
    scope.controller(atomA).invalidate()

    await advanceFrame()
    await advanceFrame()

    expect(frames).toEqual([
      ["trigger"],
      ["A", "B", "C"],
      [],
    ])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts`

Expected: FAIL - frame order will be wrong (parallel execution)

**Step 3: Commit failing test**

```bash
git add packages/lite/tests/invalidation-chain.test.ts
git commit -m "test(lite): add failing frame control test for invalidation chain"
```

---

## Task 2: Add Loop Detection Test

**Files:**
- Modify: `packages/lite/tests/invalidation-chain.test.ts`

**Step 1: Add loop detection test**

Add after the frame control test:

```typescript
  it("throws on infinite loop", async () => {
    const atomA = atom({
      factory: () => "a",
    })
    const atomB = atom({
      factory: () => "b",
    })

    const scope = createScope()

    const ctrlA = scope.controller(atomA)
    const ctrlB = scope.controller(atomB)

    await scope.resolve(atomA)
    await scope.resolve(atomB)

    ctrlA.on("resolved", () => ctrlB.invalidate())
    ctrlB.on("resolved", () => ctrlA.invalidate())

    ctrlA.invalidate()

    await expect(
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout - no loop detected")), 100)
        scope.ready.then(() => {
          queueMicrotask(() => queueMicrotask(() => {}))
        })
      })
    ).rejects.toThrow(/loop/i)
  })
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts`

Expected: FAIL - timeout (no loop detection exists)

**Step 3: Commit failing test**

```bash
git add packages/lite/tests/invalidation-chain.test.ts
git commit -m "test(lite): add failing loop detection test"
```

---

## Task 3: Add Self-Invalidation Test

**Files:**
- Modify: `packages/lite/tests/invalidation-chain.test.ts`

**Step 1: Add self-invalidation test**

Add after the loop detection test:

```typescript
  it("allows self-invalidation during factory (deferred)", async () => {
    let count = 0
    const atomA = atom({
      factory: (ctx) => {
        count++
        if (count < 3) ctx.invalidate()
        return count
      },
    })

    const scope = createScope()
    const result = await scope.resolve(atomA)

    expect(result).toBe(1)

    await new Promise((r) => setTimeout(r, 50))

    expect(count).toBe(3)
  })
```

**Step 2: Run test to verify it passes (existing behavior)**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts`

Expected: PASS - this is existing behavior we must preserve

**Step 3: Commit test**

```bash
git add packages/lite/tests/invalidation-chain.test.ts
git commit -m "test(lite): add self-invalidation test (should pass)"
```

---

## Task 4: Add Deduplication Test

**Files:**
- Modify: `packages/lite/tests/invalidation-chain.test.ts`

**Step 1: Add deduplication test**

Add after the self-invalidation test:

```typescript
  it("deduplicates concurrent invalidate() calls", async () => {
    let count = 0
    const atomA = atom({ factory: () => ++count })

    const scope = createScope()
    await scope.resolve(atomA)

    count = 0
    const ctrl = scope.controller(atomA)

    ctrl.invalidate()
    ctrl.invalidate()
    ctrl.invalidate()

    await ctrl.resolve()

    expect(count).toBe(1)
  })
```

**Step 2: Run test to verify it passes (Set dedupes)**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts`

Expected: PASS - Set already deduplicates

**Step 3: Commit test**

```bash
git add packages/lite/tests/invalidation-chain.test.ts
git commit -m "test(lite): add deduplication test (should pass)"
```

---

## Task 5: Add Chain Tracking Fields to ScopeImpl

**Files:**
- Modify: `packages/lite/src/scope.ts:148-159`

**Step 1: Add new private fields**

After line 155 (`private invalidationScheduled = false`), add:

```typescript
  private invalidationChain: Set<Lite.Atom<unknown>> | null = null
  private chainPromise: Promise<void> | null = null
  private processingChain = false
  private currentlyInvalidating: Lite.Atom<unknown> | null = null
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): add invalidation chain tracking fields"
```

---

## Task 6: Implement processInvalidationChain Method

**Files:**
- Modify: `packages/lite/src/scope.ts`

**Step 1: Replace flushInvalidations with processInvalidationChain**

Replace lines 169-176:

```typescript
  private flushInvalidations(): void {
    this.invalidationScheduled = false
    const atoms = [...this.invalidationQueue]
    this.invalidationQueue.clear()
    for (const atom of atoms) {
      this.invalidate(atom)
    }
  }
```

With:

```typescript
  private async processInvalidationChain(): Promise<void> {
    this.processingChain = true

    try {
      while (this.invalidationQueue.size > 0) {
        const atom = this.invalidationQueue.values().next().value as Lite.Atom<unknown>
        this.invalidationQueue.delete(atom)

        if (this.invalidationChain!.has(atom)) {
          const path = this.buildChainPath(atom)
          throw new Error(`Infinite invalidation loop detected: ${path}`)
        }

        this.invalidationChain!.add(atom)
        this.currentlyInvalidating = atom
        await this.doInvalidateSequential(atom)
        this.currentlyInvalidating = null
      }
    } finally {
      this.processingChain = false
      this.invalidationChain = null
      this.chainPromise = null
      this.invalidationScheduled = false
    }
  }

  private buildChainPath(loopAtom: Lite.Atom<unknown>): string {
    const atoms = Array.from(this.invalidationChain!)
    const labels = atoms.map((a, i) => `atom${i + 1}`)
    labels.push(labels[0] ?? "atom")
    return labels.join(" → ")
  }
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: FAIL - doInvalidateSequential doesn't exist yet

**Step 3: Commit work in progress**

```bash
git add packages/lite/src/scope.ts
git commit -m "wip(lite): add processInvalidationChain method"
```

---

## Task 7: Implement doInvalidateSequential Method

**Files:**
- Modify: `packages/lite/src/scope.ts`

**Step 1: Add doInvalidateSequential method**

After the `doInvalidate` method (around line 513), add:

```typescript
  private async doInvalidateSequential<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) return
    if (entry.state === "idle") return

    const previousValue = entry.value
    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      const cleanup = entry.cleanups[i]
      if (cleanup) await cleanup()
    }
    entry.cleanups = []
    entry.state = "resolving"
    entry.value = previousValue
    entry.error = undefined
    entry.pendingInvalidate = false
    this.pending.delete(atom)
    this.resolving.delete(atom)
    this.emitStateChange("resolving", atom)
    this.notifyListeners(atom, "resolving")

    await this.resolve(atom)
  }
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): add doInvalidateSequential method"
```

---

## Task 8: Update scheduleInvalidation to Use Chain

**Files:**
- Modify: `packages/lite/src/scope.ts:161-167`

**Step 1: Update scheduleInvalidation**

Replace:

```typescript
  private scheduleInvalidation<T>(atom: Lite.Atom<T>): void {
    this.invalidationQueue.add(atom)
    if (!this.invalidationScheduled) {
      this.invalidationScheduled = true
      queueMicrotask(() => this.flushInvalidations())
    }
  }
```

With:

```typescript
  private scheduleInvalidation<T>(atom: Lite.Atom<T>): void {
    if (this.currentlyInvalidating === atom) {
      const entry = this.cache.get(atom)
      if (entry) {
        entry.pendingInvalidate = true
      }
      return
    }

    this.invalidationQueue.add(atom)

    if (!this.chainPromise) {
      this.invalidationChain = new Set()
      this.invalidationScheduled = true
      this.chainPromise = new Promise<void>((resolve, reject) => {
        queueMicrotask(() => {
          this.processInvalidationChain().then(resolve).catch(reject)
        })
      })
    }
  }
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): update scheduleInvalidation to use chain"
```

---

## Task 9: Update invalidate Method

**Files:**
- Modify: `packages/lite/src/scope.ts:482-493`

**Step 1: Update invalidate to use scheduleInvalidation**

Replace:

```typescript
  invalidate<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    if (entry.state === 'idle') return

    if (entry.state === 'resolving') {
      entry.pendingInvalidate = true
      return
    }

    this.doInvalidate(atom, entry as AtomEntry<T>)
  }
```

With:

```typescript
  invalidate<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    if (entry.state === "idle") return

    if (entry.state === "resolving") {
      entry.pendingInvalidate = true
      return
    }

    this.scheduleInvalidation(atom)
  }
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): update invalidate to use scheduleInvalidation"
```

---

## Task 10: Run All Tests

**Files:**
- Test: `packages/lite/tests/`

**Step 1: Run invalidation chain tests**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts`

Expected:
- Frame control test: PASS
- Loop detection test: PASS
- Self-invalidation test: PASS
- Deduplication test: PASS

**Step 2: Run all lite tests**

Run: `pnpm -F @pumped-fn/lite test`

Expected: All existing tests PASS

**Step 3: Commit if any fixes needed**

If tests fail, debug and fix, then:

```bash
git add -A
git commit -m "fix(lite): address test failures in invalidation chain"
```

---

## Task 11: Update Loop Detection Test for Better Error

**Files:**
- Modify: `packages/lite/tests/invalidation-chain.test.ts`

**Step 1: Fix loop detection test to catch the error properly**

Replace the loop detection test with:

```typescript
  it("throws on infinite loop", async () => {
    const atomA = atom({
      factory: () => "a",
    })
    const atomB = atom({
      factory: () => "b",
    })

    const scope = createScope()

    const ctrlA = scope.controller(atomA)
    const ctrlB = scope.controller(atomB)

    await scope.resolve(atomA)
    await scope.resolve(atomB)

    ctrlA.on("resolved", () => ctrlB.invalidate())
    ctrlB.on("resolved", () => ctrlA.invalidate())

    ctrlA.invalidate()

    await new Promise((resolve) => setTimeout(resolve, 50))

    await expect(scope.resolve(atomA)).rejects.toThrow(/loop/i)
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts`

Expected: All PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/invalidation-chain.test.ts
git commit -m "test(lite): fix loop detection test assertion"
```

---

## Task 12: Run Full Test Suite and Typecheck

**Files:**
- All

**Step 1: Typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`

Expected: PASS

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`

Expected: All PASS

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(lite): complete sequential invalidation chain implementation

- Sequential chain execution (await each atom before next)
- Loop detection throws on A → B → A patterns
- Self-invalidation during factory remains deferred
- Frame control: trigger (0), chain (1), settle (2)
- Duplicate invalidate() calls deduplicated via Set

Implements ADR-011"
```

---

## Task 13: Update ADR Status

**Files:**
- Modify: `.c3/adr/adr-011-sequential-invalidation-chain.md`

**Step 1: Update status from proposed to accepted**

Change line 7:

```markdown
status: proposed
```

To:

```markdown
status: accepted
```

And update the Status section:

```markdown
## Status {#adr-011-status}
**Accepted** - 2025-12-02
```

**Step 2: Commit**

```bash
git add .c3/adr/adr-011-sequential-invalidation-chain.md
git commit -m "docs(lite): mark ADR-011 as accepted"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Frame control test | tests/invalidation-chain.test.ts |
| 2 | Loop detection test | tests/invalidation-chain.test.ts |
| 3 | Self-invalidation test | tests/invalidation-chain.test.ts |
| 4 | Deduplication test | tests/invalidation-chain.test.ts |
| 5 | Add chain tracking fields | src/scope.ts |
| 6 | processInvalidationChain method | src/scope.ts |
| 7 | doInvalidateSequential method | src/scope.ts |
| 8 | Update scheduleInvalidation | src/scope.ts |
| 9 | Update invalidate method | src/scope.ts |
| 10 | Run all tests | tests/ |
| 11 | Fix loop detection test | tests/invalidation-chain.test.ts |
| 12 | Full test suite | all |
| 13 | Update ADR status | .c3/adr/ |

**Verification commands:**
```bash
pnpm -F @pumped-fn/lite typecheck      # Types
pnpm -F @pumped-fn/lite typecheck:full # Types + tests
pnpm -F @pumped-fn/lite test           # All tests
```
