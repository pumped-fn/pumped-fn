# Scope.controller() Options Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `{ resolve: true }` option to `scope.controller()` for API consistency with the `controller()` dependency helper.

**Architecture:** Add overloaded signatures to `Scope.controller()` - when called without options returns `Controller<T>` synchronously (existing behavior), when called with `{ resolve: true }` returns `Promise<Controller<T>>` that resolves to a pre-resolved controller.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Add Tests for scope.controller() with Options

**Files:**
- Modify: `packages/lite/tests/scope.test.ts:108-169` (add to existing `scope.controller()` describe block)

**Step 1: Write the failing tests**

Add these tests after line 169 (inside the `scope.controller()` describe block, before the closing `})`):

```typescript
    it("returns promise with { resolve: true } option", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const result = scope.controller(myAtom, { resolve: true })
      expect(result).toBeInstanceOf(Promise)

      const ctrl = await result
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(42)
    })

    it("controller from { resolve: true } is same instance as regular controller", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const ctrl1 = scope.controller(myAtom)
      const ctrl2 = await scope.controller(myAtom, { resolve: true })

      await ctrl1.resolve()
      expect(ctrl1.get()).toBe(ctrl2.get())
    })

    it("{ resolve: true } works with async factory", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return "async-value"
        }
      })

      const ctrl = await scope.controller(myAtom, { resolve: true })
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe("async-value")
    })

    it("{ resolve: true } propagates factory errors", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: () => {
          throw new Error("factory error")
        }
      })

      await expect(scope.controller(myAtom, { resolve: true }))
        .rejects.toThrow("factory error")
    })
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pumped-fn/lite test -- --run scope.test.ts`

Expected: FAIL - TypeScript errors about `controller()` not accepting options

**Step 3: Commit failing tests**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): add tests for scope.controller() with { resolve: true } option"
```

---

## Task 2: Update Scope Interface in types.ts

**Files:**
- Modify: `packages/lite/src/types.ts:18-32`

**Step 1: Update Scope interface with overloaded controller signatures**

Replace line 21:
```typescript
    controller<T>(atom: Atom<T>): Controller<T>
```

With:
```typescript
    controller<T>(atom: Atom<T>): Controller<T>
    controller<T>(atom: Atom<T>, options: { resolve: true }): Promise<Controller<T>>
    controller<T>(atom: Atom<T>, options?: ControllerOptions): Controller<T> | Promise<Controller<T>>
```

**Step 2: Run typecheck to verify interface update**

Run: `pnpm --filter @pumped-fn/lite typecheck`

Expected: FAIL - ScopeImpl doesn't match new interface

**Step 3: Commit interface change**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add overloaded controller() signatures to Scope interface"
```

---

## Task 3: Implement controller() Options in ScopeImpl

**Files:**
- Modify: `packages/lite/src/scope.ts:543-545`

**Step 1: Update controller method implementation**

Replace lines 543-545:
```typescript
  controller<T>(atom: Lite.Atom<T>): Lite.Controller<T> {
    return new ControllerImpl(atom, this)
  }
```

With:
```typescript
  controller<T>(atom: Lite.Atom<T>): Lite.Controller<T>
  controller<T>(atom: Lite.Atom<T>, options: { resolve: true }): Promise<Lite.Controller<T>>
  controller<T>(atom: Lite.Atom<T>, options?: Lite.ControllerOptions): Lite.Controller<T> | Promise<Lite.Controller<T>>
  controller<T>(atom: Lite.Atom<T>, options?: Lite.ControllerOptions): Lite.Controller<T> | Promise<Lite.Controller<T>> {
    const ctrl = new ControllerImpl(atom, this)
    if (options?.resolve) {
      return ctrl.resolve().then(() => ctrl)
    }
    return ctrl
  }
```

**Step 2: Run typecheck to verify implementation**

Run: `pnpm --filter @pumped-fn/lite typecheck`

Expected: PASS

**Step 3: Run tests to verify implementation**

Run: `pnpm --filter @pumped-fn/lite test -- --run scope.test.ts`

Expected: PASS - all tests including new ones

**Step 4: Commit implementation**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): implement scope.controller() with { resolve: true } option"
```

---

## Task 4: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-2-lite/c3-201-scope.md:95-107` (Scope Interface section)
- Modify: `.c3/c3-2-lite/c3-201-scope.md:161-206` (Controller Usage section)

**Step 1: Update Scope Interface documentation**

In `.c3/c3-2-lite/c3-201-scope.md`, replace lines 98-106:
```typescript
interface Scope {
  readonly ready: Promise<void>  // Resolves when extensions initialized
  resolve<T>(atom: Atom<T>): Promise<T>
  controller<T>(atom: Atom<T>): Controller<T>
  release<T>(atom: Atom<T>): Promise<void>
  dispose(): Promise<void>
  createContext(options?: CreateContextOptions): ExecutionContext
  on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void
}
```

With:
```typescript
interface Scope {
  readonly ready: Promise<void>  // Resolves when extensions initialized
  resolve<T>(atom: Atom<T>): Promise<T>
  controller<T>(atom: Atom<T>): Controller<T>
  controller<T>(atom: Atom<T>, options: { resolve: true }): Promise<Controller<T>>
  release<T>(atom: Atom<T>): Promise<void>
  dispose(): Promise<void>
  createContext(options?: CreateContextOptions): ExecutionContext
  on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void
}
```

**Step 2: Add Pre-Resolved Controller section after Basic Controller**

After line 173 (after the Basic Controller example), add:

```markdown
### Pre-Resolved Controller via Scope

When you need a controller that's already resolved outside of atom dependencies:

```typescript
// Returns Promise<Controller<T>> - controller is resolved when promise settles
const ctrl = await scope.controller(configAtom, { resolve: true })
console.log(ctrl.state)  // 'resolved'
console.log(ctrl.get())  // { port: 3000 } - safe, no throw
```

| Call | Return Type | Controller State |
|------|-------------|------------------|
| `scope.controller(atom)` | `Controller<T>` | `idle` |
| `scope.controller(atom, { resolve: true })` | `Promise<Controller<T>>` | `resolved` after await |

**Note:** Unlike the `controller()` dependency helper which is consumed during async dep resolution, `scope.controller()` must return a `Promise` when `{ resolve: true }` is specified because resolution is inherently async.
```

**Step 3: Commit documentation**

```bash
git add .c3/c3-2-lite/c3-201-scope.md
git commit -m "docs(c3): update scope.controller() documentation with { resolve: true } option"
```

---

## Task 5: Update ADR Status

**Files:**
- Modify: `.c3/adr/adr-019-scope-controller-options.md:8` and lines 14-15

**Step 1: Update ADR status to Accepted**

Change line 8:
```yaml
status: proposed
```
To:
```yaml
status: accepted
```

Change lines 14-15:
```markdown
## Status {#adr-019-status}
**Proposed** - 2025-12-11
```
To:
```markdown
## Status {#adr-019-status}
**Accepted** - 2025-12-11
```

**Step 2: Update verification checklist**

Replace the verification section (lines 125-133) with checked items:
```markdown
## Verification {#adr-019-verification}

- [x] `scope.controller(atom)` returns `Controller<T>` immediately (backward compatible)
- [x] `scope.controller(atom, { resolve: true })` returns `Promise<Controller<T>>`
- [x] Returned controller is in `resolved` state after await
- [x] `ctrl.get()` works immediately with resolved controller
- [x] Type narrowing works correctly with overloads
- [x] Resolution caching preserved (same atom = same controller)
- [ ] (Optional) `useController(atom, { resolve: true })` integrates with Suspense
```

**Step 3: Commit ADR update**

```bash
git add .c3/adr/adr-019-scope-controller-options.md
git commit -m "docs(adr): accept ADR-019 scope.controller() options"
```

---

## Task 6: Regenerate TOC and Run C3 Audit

**Step 1: Regenerate TOC**

Run: `.c3/scripts/build-toc.sh`

**Step 2: Run C3 audit**

Run: `/c3-skill:c3-audit` to verify documentation consistency

**Step 3: Fix any audit issues**

Address any discrepancies found by the audit.

**Step 4: Commit TOC update**

```bash
git add .c3/TOC.md
git commit -m "docs(c3): regenerate TOC"
```

---

## Task 7: Final Verification

**Step 1: Run full test suite**

Run: `pnpm --filter @pumped-fn/lite test`

Expected: All tests pass

**Step 2: Run typecheck**

Run: `pnpm --filter @pumped-fn/lite typecheck`

Expected: No errors

**Step 3: Build package**

Run: `pnpm --filter @pumped-fn/lite build`

Expected: Build succeeds
