# Select Fine-Grained Reactivity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `scope.select()` method for fine-grained reactivity with selector + equality-based change detection.

**Architecture:** SelectHandle wraps Controller subscription with selector function and equality comparison. Auto-cleans when all subscribers unsubscribe. Designed for React 18+ `useSyncExternalStore` compatibility.

**Tech Stack:** TypeScript, Vitest, @pumped-fn/lite

**Reference:** `.c3/adr/adr-006-select-fine-grained-reactivity.md`

---

## Task 1: Add Type Definitions

**Files:**
- Modify: `packages/lite/src/types.ts:86-87` (after Controller interface)

**Step 1: Add SelectOptions and SelectHandle interfaces to Lite namespace**

Add after the `Controller<T>` interface (around line 86):

```typescript
  export interface SelectOptions<S> {
    eq?: (prev: S, next: S) => boolean
  }

  export interface SelectHandle<S> {
    get(): S
    subscribe(listener: () => void): () => void
  }
```

**Step 2: Add select() method to Scope interface**

Modify the `Scope` interface (around line 17-24) to add:

```typescript
  export interface Scope {
    resolve<T>(atom: Atom<T>): Promise<T>
    controller<T>(atom: Atom<T>): Controller<T>
    select<T, S>(
      atom: Atom<T>,
      selector: (value: T) => S,
      options?: SelectOptions<S>
    ): SelectHandle<S>
    release<T>(atom: Atom<T>): Promise<void>
    dispose(): Promise<void>
    createContext(options?: CreateContextOptions): ExecutionContext
    on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void
  }
```

**Step 3: Run typecheck to verify types compile**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: PASS (types only, no implementation yet)

**Step 4: Commit**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add SelectHandle and SelectOptions types"
```

---

## Task 2: Write Failing Test - Basic select() and get()

**Files:**
- Create: `packages/lite/tests/select.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom } from "../src/atom"

describe("scope.select()", () => {
  describe("basic functionality", () => {
    it("returns SelectHandle with get()", async () => {
      const scope = await createScope()
      const todosAtom = atom({ factory: () => [
        { id: "1", text: "Learn TypeScript" },
        { id: "2", text: "Build app" }
      ]})

      await scope.resolve(todosAtom)

      const handle = scope.select(
        todosAtom,
        (todos) => todos.find(t => t.id === "1")
      )

      expect(handle).toBeDefined()
      expect(handle.get).toBeTypeOf("function")
      expect(handle.subscribe).toBeTypeOf("function")
      expect(handle.get()).toEqual({ id: "1", text: "Learn TypeScript" })
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: FAIL with "scope.select is not a function" or similar

**Step 3: Commit failing test**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): add failing test for scope.select() basic functionality"
```

---

## Task 3: Implement SelectHandleImpl Class

**Files:**
- Modify: `packages/lite/src/scope.ts` (add before ScopeImpl class)

**Step 1: Add SelectHandleImpl class**

Add after the imports and before `ControllerImpl`:

```typescript
class SelectHandleImpl<T, S> implements Lite.SelectHandle<S> {
  private listeners = new Set<() => void>()
  private currentValue: S
  private ctrlUnsub: (() => void) | null = null

  constructor(
    private ctrl: Lite.Controller<T>,
    private selector: (value: T) => S,
    private eq: (prev: S, next: S) => boolean
  ) {
    if (ctrl.state !== 'resolved') {
      throw new Error("Cannot select from unresolved atom")
    }

    this.currentValue = selector(ctrl.get())

    this.ctrlUnsub = ctrl.on(() => {
      if (this.ctrl.state !== 'resolved') return

      const nextValue = this.selector(this.ctrl.get())
      if (!this.eq(this.currentValue, nextValue)) {
        this.currentValue = nextValue
        this.notifyListeners()
      }
    })
  }

  get(): S {
    return this.currentValue
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.cleanup()
      }
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private cleanup(): void {
    this.ctrlUnsub?.()
    this.ctrlUnsub = null
    this.listeners.clear()
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): add SelectHandleImpl class"
```

---

## Task 4: Add select() Method to ScopeImpl

**Files:**
- Modify: `packages/lite/src/scope.ts` (add to ScopeImpl class)

**Step 1: Add select() method to ScopeImpl**

Add after the `controller()` method in `ScopeImpl`:

```typescript
  select<T, S>(
    atom: Lite.Atom<T>,
    selector: (value: T) => S,
    options?: Lite.SelectOptions<S>
  ): Lite.SelectHandle<S> {
    const ctrl = this.controller(atom)
    const eq = options?.eq ?? ((a, b) => a === b)
    return new SelectHandleImpl(ctrl, selector, eq)
  }
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/src/scope.ts
git commit -m "feat(lite): add select() method to ScopeImpl"
```

---

## Task 5: Test - Throws if Atom Not Resolved

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the failing test**

Add to the `describe("scope.select()")` block:

```typescript
    it("throws if atom not resolved", async () => {
      const scope = await createScope()
      const todosAtom = atom({ factory: () => [{ id: "1", text: "Test" }] })

      expect(() => {
        scope.select(todosAtom, (todos) => todos[0])
      }).toThrow("Cannot select from unresolved atom")
    })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS (implementation already throws)

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify select() throws on unresolved atom"
```

---

## Task 6: Test - Default Equality (Reference)

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the test**

Add to the `describe("scope.select()")` block:

```typescript
  describe("equality", () => {
    it("uses reference equality by default", async () => {
      const scope = await createScope()
      const obj1 = { id: "1" }
      const obj2 = { id: "1" }
      let resolveCount = 0
      const dataAtom = atom({
        factory: () => {
          resolveCount++
          return resolveCount === 1 ? obj1 : obj2
        }
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(dataAtom, (data) => data)

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(1)
    })

    it("does not notify when reference is same", async () => {
      const scope = await createScope()
      const sharedObj = { id: "1" }
      const dataAtom = atom({ factory: () => sharedObj })

      await scope.resolve(dataAtom)
      const handle = scope.select(dataAtom, (data) => data)

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(0)
    })
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify select() default reference equality"
```

---

## Task 7: Test - Custom Equality Function

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the test**

Add to the `describe("equality")` block:

```typescript
    it("uses custom eq function", async () => {
      const scope = await createScope()
      let version = 1
      const dataAtom = atom({
        factory: () => ({ id: "1", version: version++ })
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(
        dataAtom,
        (data) => data,
        { eq: (a, b) => a.id === b.id }
      )

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(0)
    })

    it("notifies when custom eq returns false", async () => {
      const scope = await createScope()
      let id = 1
      const dataAtom = atom({
        factory: () => ({ id: String(id++) })
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(
        dataAtom,
        (data) => data,
        { eq: (a, b) => a.id === b.id }
      )

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(1)
      expect(handle.get().id).toBe("2")
    })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify select() custom equality function"
```

---

## Task 8: Test - Multiple Subscribers

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the test**

Add new describe block:

```typescript
  describe("subscription", () => {
    it("supports multiple subscribers", async () => {
      const scope = await createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      let count1 = 0
      let count2 = 0
      handle.subscribe(() => count1++)
      handle.subscribe(() => count2++)

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(count1).toBe(1)
      expect(count2).toBe(1)
    })

    it("unsubscribe removes specific listener", async () => {
      const scope = await createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      let count1 = 0
      let count2 = 0
      const unsub1 = handle.subscribe(() => count1++)
      handle.subscribe(() => count2++)

      unsub1()

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(count1).toBe(0)
      expect(count2).toBe(1)
    })
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify select() multiple subscribers"
```

---

## Task 9: Test - Auto-cleanup on Zero Subscribers

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the test**

Add to the `describe("subscription")` block:

```typescript
    it("auto-cleans when last subscriber unsubscribes", async () => {
      const scope = await createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      const unsub1 = handle.subscribe(() => {})
      const unsub2 = handle.subscribe(() => {})

      unsub1()
      unsub2()

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(handle.get()).toBe(1)
    })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify select() auto-cleanup on zero subscribers"
```

---

## Task 10: Test - Selector Only Runs When Resolved

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the test**

Add new describe block:

```typescript
  describe("selector execution", () => {
    it("only runs selector when atom is resolved", async () => {
      const scope = await createScope()
      let selectorCalls = 0
      const asyncAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 30))
          return 42
        }
      })

      await scope.resolve(asyncAtom)
      const handle = scope.select(asyncAtom, (n) => {
        selectorCalls++
        return n * 2
      })

      expect(selectorCalls).toBe(1)
      expect(handle.get()).toBe(84)

      handle.subscribe(() => {})

      scope.controller(asyncAtom).invalidate()

      await new Promise(r => setTimeout(r, 10))
      const callsDuringResolving = selectorCalls

      await new Promise(r => setTimeout(r, 50))
      const callsAfterResolved = selectorCalls

      expect(callsDuringResolving).toBe(1)
      expect(callsAfterResolved).toBe(2)
    })
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify selector only runs when atom resolved"
```

---

## Task 11: Test - Multiple Selects on Same Atom

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the test**

Add new describe block:

```typescript
  describe("multiple selects", () => {
    it("multiple selects on same atom work independently", async () => {
      const scope = await createScope()
      let count = 0
      const dataAtom = atom({
        factory: () => ({ a: count++, b: count++ })
      })

      await scope.resolve(dataAtom)

      const handleA = scope.select(dataAtom, (d) => d.a)
      const handleB = scope.select(dataAtom, (d) => d.b)

      expect(handleA.get()).toBe(0)
      expect(handleB.get()).toBe(1)

      let notifyA = 0
      let notifyB = 0
      handleA.subscribe(() => notifyA++)
      handleB.subscribe(() => notifyB++)

      scope.controller(dataAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyA).toBe(1)
      expect(notifyB).toBe(1)
      expect(handleA.get()).toBe(2)
      expect(handleB.get()).toBe(3)
    })
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): verify multiple selects work independently"
```

---

## Task 12: Test - TodoItem Use Case (Integration)

**Files:**
- Modify: `packages/lite/tests/select.test.ts`

**Step 1: Write the integration test**

Add new describe block:

```typescript
  describe("TodoItem use case", () => {
    it("only notifies when specific todo changes", async () => {
      interface Todo {
        id: string
        text: string
        updatedAt: number
      }

      const scope = await createScope()
      let todos: Todo[] = [
        { id: "1", text: "Learn", updatedAt: 100 },
        { id: "2", text: "Build", updatedAt: 200 },
        { id: "3", text: "Ship", updatedAt: 300 }
      ]

      const todosAtom = atom({ factory: () => [...todos] })
      await scope.resolve(todosAtom)

      const handle1 = scope.select(
        todosAtom,
        (t) => t.find(x => x.id === "1"),
        { eq: (a, b) => a?.updatedAt === b?.updatedAt }
      )

      const handle2 = scope.select(
        todosAtom,
        (t) => t.find(x => x.id === "2"),
        { eq: (a, b) => a?.updatedAt === b?.updatedAt }
      )

      let notify1 = 0
      let notify2 = 0
      handle1.subscribe(() => notify1++)
      handle2.subscribe(() => notify2++)

      todos = [
        { id: "1", text: "Learn", updatedAt: 100 },
        { id: "2", text: "Build MORE", updatedAt: 201 },
        { id: "3", text: "Ship", updatedAt: 300 }
      ]

      scope.controller(todosAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notify1).toBe(0)
      expect(notify2).toBe(1)
      expect(handle2.get()?.text).toBe("Build MORE")
    })
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- select.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/lite/tests/select.test.ts
git commit -m "test(lite): add TodoItem use case integration test"
```

---

## Task 13: Run Full Test Suite

**Files:** None (verification only)

**Step 1: Run all lite tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 3: Commit if any fixes needed**

---

## Task 14: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-2-lite/c3-201-scope.md`
- Modify: `.c3/c3-2-lite/README.md`

**Step 1: Add select() to c3-201-scope.md**

Add new section after "Controller Usage":

```markdown
## Select Usage {#c3-201-select}

### Creating a SelectHandle

```typescript
const handle = scope.select(
  todosAtom,
  (todos) => todos.find(t => t.id === itemId),
  { eq: (a, b) => a?.updatedAt === b?.updatedAt }
)
```

### SelectHandle Interface

```typescript
interface SelectHandle<S> {
  get(): S                                    // Current sliced value
  subscribe(listener: () => void): () => void // Subscribe to changes
}
```

### Usage Pattern

```typescript
// Get current value
const todo = handle.get()

// Subscribe to changes
const unsub = handle.subscribe(() => {
  console.log('Changed:', handle.get())
})

// Cleanup
unsub() // Auto-cleans handle when last subscriber leaves
```

### Behavior

| Condition | Result |
|-----------|--------|
| Atom not resolved | Throws error |
| eq returns true | No notification |
| eq returns false | Notify + update value |
| Last subscriber leaves | Auto-cleanup |
```

**Step 2: Add select() to Public API in README.md**

Add to the Factory Functions table:

```markdown
| `scope.select(atom, selector, options?)` | Create fine-grained subscription | `SelectHandle<S>` |
```

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-201-scope.md .c3/c3-2-lite/README.md
git commit -m "docs(c3): add select() documentation"
```

---

## Task 15: Update ADR Status

**Files:**
- Modify: `.c3/adr/adr-006-select-fine-grained-reactivity.md`

**Step 1: Change status to Accepted**

Change:
```markdown
**Proposed** - 2025-12-01
```

To:
```markdown
**Accepted** - 2025-12-01
```

**Step 2: Commit**

```bash
git add .c3/adr/adr-006-select-fine-grained-reactivity.md
git commit -m "docs(adr): accept ADR-006 select fine-grained reactivity"
```

---

## Task 16: Final Verification

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All PASS

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add type definitions | `types.ts` |
| 2-4 | Implement SelectHandleImpl + select() | `scope.ts`, `select.test.ts` |
| 5-12 | Test all behaviors | `select.test.ts` |
| 13 | Full test suite verification | - |
| 14-15 | Update documentation | `.c3/` |
| 16 | Final verification | - |

**Total: 16 tasks, ~45-60 minutes**
