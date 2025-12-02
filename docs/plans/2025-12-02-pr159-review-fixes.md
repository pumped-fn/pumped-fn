# PR #159 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address code review feedback on sequential invalidation chain PR #159.

**Architecture:** Fix state transition order so cleanups run BEFORE state changes to 'resolving' (matching C3-201 docs). Add `scope.flush()` for awaiting pending invalidations. Improve loop error messages with factory names.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Simplify scheduleInvalidation (Remove State Mutation)

**Files:**
- Modify: `packages/lite/src/scope.ts:165-200`

**Step 1: Read current scheduleInvalidation**

Run: `cat -n packages/lite/src/scope.ts | sed -n '165,200p'`

Understand the current state mutation that happens BEFORE queueing.

**Step 2: Replace scheduleInvalidation to only queue atoms**

Replace `scheduleInvalidation` method with version that ONLY queues (no state mutation):

```typescript
private scheduleInvalidation<T>(atom: Lite.Atom<T>): void {
  const entry = this.cache.get(atom) as AtomEntry<T> | undefined
  if (!entry || entry.state === "idle") return

  if (entry.state === "resolving") {
    entry.pendingInvalidate = true
    return
  }

  if (this.currentlyInvalidating === atom && entry.state !== "resolved") {
    entry.pendingInvalidate = true
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

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS (method signature unchanged)

**Step 4: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "refactor(lite): scheduleInvalidation only queues, no state mutation"
```

---

## Task 2: Update doInvalidateSequential (Add State Transition)

**Files:**
- Modify: `packages/lite/src/scope.ts:574-586`

**Step 1: Read current doInvalidateSequential**

Run: `cat -n packages/lite/src/scope.ts | sed -n '574,590p'`

**Step 2: Replace doInvalidateSequential with full state transition**

Replace the method to: run cleanups → transition state → notify → resolve:

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

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 4: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "refactor(lite): doInvalidateSequential does full state transition after cleanups"
```

---

## Task 3: Delete Dead Code (doInvalidate method)

**Files:**
- Modify: `packages/lite/src/scope.ts:555-572`

**Step 1: Verify doInvalidate is unused**

Run: `grep -n "doInvalidate\b" packages/lite/src/scope.ts`

Expected: Only find the method definition, no calls to it.

**Step 2: Delete the doInvalidate method**

Delete the entire `doInvalidate` method (the old fire-and-forget version). It's approximately lines 555-572.

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS (confirms no references)

**Step 4: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "refactor(lite): delete dead doInvalidate() method"
```

---

## Task 4: Add scope.flush() Method

**Files:**
- Modify: `packages/lite/src/scope.ts`
- Modify: `packages/lite/src/types.ts`

**Step 1: Add flush method to ScopeImpl**

After the `dispose()` method in ScopeImpl, add:

```typescript
async flush(): Promise<void> {
  if (this.chainPromise) {
    await this.chainPromise
  }
}
```

**Step 2: Run typecheck (expect fail - interface missing)**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: FAIL - flush not in Scope interface

**Step 3: Add flush to Scope interface in types.ts**

Find the Scope interface and add after `dispose()`:

```typescript
flush(): Promise<void>
```

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/lite/src/scope.ts packages/lite/src/types.ts
git commit -m "feat(lite): add scope.flush() to await pending invalidations"
```

---

## Task 5: Improve Loop Error Messages

**Files:**
- Modify: `packages/lite/src/scope.ts:202-226`

**Step 1: Delete buildChainPath method**

Delete lines 228-232 (the buildChainPath method).

**Step 2: Update processInvalidationChain with inline path building using factory names**

Replace the loop detection in processInvalidationChain:

```typescript
private async processInvalidationChain(): Promise<void> {
  this.processingChain = true

  try {
    while (this.invalidationQueue.size > 0) {
      const atom = this.invalidationQueue.values().next().value as Lite.Atom<unknown>
      this.invalidationQueue.delete(atom)

      if (this.invalidationChain!.has(atom)) {
        const chainAtoms = Array.from(this.invalidationChain!)
        chainAtoms.push(atom)
        const path = chainAtoms
          .map(a => a.factory?.name || "<anonymous>")
          .join(" → ")
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
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 4: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "fix(lite): loop error shows factory names instead of atom1/atom2"
```

---

## Task 6: Rewrite Loop Detection Test

**Files:**
- Modify: `packages/lite/tests/invalidation-chain.test.ts:41-96`

**Step 1: Read current messy test**

Run: `cat -n packages/lite/tests/invalidation-chain.test.ts | sed -n '41,96p'`

**Step 2: Replace with clean test using flush()**

Replace the "throws on infinite loop" test:

```typescript
it("throws on infinite loop", async () => {
  function factoryA() { return "a" }
  function factoryB() { return "b" }

  const atomA = atom({ factory: factoryA })
  const atomB = atom({ factory: factoryB })

  const scope = createScope()

  const ctrlA = scope.controller(atomA)
  const ctrlB = scope.controller(atomB)

  await scope.resolve(atomA)
  await scope.resolve(atomB)

  ctrlA.on("resolved", () => ctrlB.invalidate())
  ctrlB.on("resolved", () => ctrlA.invalidate())

  ctrlA.invalidate()

  await expect(scope.flush()).rejects.toThrow(/Infinite invalidation loop detected/)
})
```

**Step 3: Run the test**

Run: `pnpm -F @pumped-fn/lite test -- invalidation-chain.test.ts -t "throws on infinite loop"`

Expected: PASS

**Step 4: Commit**

```bash
git add packages/lite/tests/invalidation-chain.test.ts
git commit -m "test(lite): rewrite loop detection test using flush()"
```

---

## Task 7: Update Immediate State Tests

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

State now transitions AFTER cleanups (via microtask), so tests expecting immediate state change need updating.

**Step 1: Find tests checking immediate state**

Run: `grep -n "ctrl.state.*resolving" packages/lite/tests/scope.test.ts`

**Step 2: Update "sets state to resolving immediately" test (line ~632)**

Find and update to wait for microtask:

```typescript
it("sets state to resolving after invalidate microtask", async () => {
  const scope = createScope()
  const myAtom = atom({
    factory: async () => {
      await new Promise(r => setTimeout(r, 50))
      return "value"
    }
  })
  const ctrl = scope.controller(myAtom)
  await ctrl.resolve()
  expect(ctrl.state).toBe("resolved")
  expect(ctrl.get()).toBe("value")

  ctrl.invalidate()
  await Promise.resolve()
  await Promise.resolve()
  expect(ctrl.state).toBe("resolving")
  expect(ctrl.get()).toBe("value")
})
```

**Step 3: Update line ~160 test**

Add microtask waits after invalidate() calls.

**Step 4: Update line ~647 test**

Add microtask waits after invalidate() calls.

**Step 5: Update line ~712 test**

Add microtask waits after invalidate() calls.

**Step 6: Run scope tests**

Run: `pnpm -F @pumped-fn/lite test -- scope.test.ts`

Expected: All PASS

**Step 7: Commit**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): update tests for new state transition timing"
```

---

## Task 8: Run Full Test Suite

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`

Expected: All 117+ tests PASS

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

**Step 3: Fix any failures (if needed)**

Debug and fix any remaining test failures.

---

## Task 9: Final Commit and Push

**Step 1: Check git status**

Run: `git status`

**Step 2: Stage any unstaged changes**

Run: `git add packages/lite/`

**Step 3: Create final commit if needed**

```bash
git commit -m "fix(lite): final review feedback fixes"
```

**Step 4: Push to update PR**

Run: `git push`

Expected: PR #159 updated with all review fixes

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Remove state mutation from scheduleInvalidation | scope.ts |
| 2 | Add state transition to doInvalidateSequential | scope.ts |
| 3 | Delete dead doInvalidate() | scope.ts |
| 4 | Add scope.flush() | scope.ts, types.ts |
| 5 | Improve loop error messages | scope.ts |
| 6 | Rewrite loop detection test | invalidation-chain.test.ts |
| 7 | Update immediate state tests | scope.test.ts |
| 8 | Run full test suite | - |
| 9 | Push to PR | - |

**Verification Commands:**
```bash
pnpm -F @pumped-fn/lite typecheck
pnpm -F @pumped-fn/lite test
```
