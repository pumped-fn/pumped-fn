---
id: ADR-009-fix-duplicate-listener-notifications
title: Fix Duplicate Listener Notifications and Improve Controller.on() API
summary: >
  Fix bug where Controller.on() listeners are called 3 times per invalidation
  cycle, and improve API to allow filtering by state ('resolving', 'resolved', '*').
status: accepted
date: 2025-12-01
---

# [ADR-009] Fix Duplicate Listener Notifications and Improve Controller.on() API

## Status {#adr-009-status}
**Accepted** - 2025-12-01

## Problem/Requirement {#adr-009-problem}

### Bug: Duplicate Notifications

When an atom self-invalidates via `ctx.invalidate()`, the listener registered with `controller.on()` is called 3 times per invalidation cycle instead of the expected 2 times.

**Reproduction:**

```typescript
const counter = atom({
  factory(ctx) {
    let count = ctx.data.get('count') as number | undefined ?? 0

    const interval = setInterval(() => {
      ctx.data.set('count', count + 1)
      ctx.invalidate()
    }, 1000)

    ctx.cleanup(() => clearInterval(interval))
    return count
  },
})

const scope = await createScope()
const ctl = scope.controller(counter)
await ctl.resolve()

ctl.on(() => {
  console.log('Count:', ctl.get())
})
```

**Actual output:**
```
Count: 1
Count: 2
Count: 2
Count: 2
Count: 3
Count: 3
Count: 3
```

### API Issue: No State Filtering

The current `on()` API fires for all state changes. Users typically only care about 'resolved' state but must manually filter:

```typescript
ctl.on(() => {
  if (ctl.state === 'resolved') {
    console.log('Value:', ctl.get())
  }
})
```

## Exploration Journey {#adr-009-exploration}

**Initial hypothesis:** Listener is being registered multiple times or notification logic has a bug.

**Explored:**

Traced the invalidation flow in `scope.ts`:

1. **`doInvalidate()` (lines 426-443):**
   - Line 433: `entry.state = 'resolving'`
   - Line 439: `emitStateChange('resolving', atom)`
   - Line 440: `notifyListeners(atom)` ← **1st notification**
   - Line 442: calls `this.resolve(atom)`

2. **`doResolve()` (lines 280-345):**
   - Line 282: `entry.state = 'resolving'` ← already 'resolving'!
   - Line 283: `emitStateChange('resolving', atom)` ← redundant
   - Line 284: `notifyListeners(atom)` ← **2nd notification (BUG)**
   - ... factory runs ...
   - Line 317: `entry.state = 'resolved'`
   - Line 321: `emitStateChange('resolved', atom)`
   - Line 322: `notifyListeners(atom)` ← **3rd notification**

**Discovered:**

The bug is that `doResolve()` unconditionally sets state to 'resolving' and notifies listeners, even when called from `doInvalidate()` which has already done this.

```
doInvalidate() ─┬─► state = 'resolving'
                ├─► notifyListeners()     ← 1st
                └─► resolve()
                      └─► doResolve()
                            ├─► state = 'resolving'  ← redundant
                            ├─► notifyListeners()    ← 2nd (BUG)
                            ├─► factory()
                            ├─► state = 'resolved'
                            └─► notifyListeners()    ← 3rd
```

**Confirmed:** Two changes needed:
1. Fix: `doResolve` should skip 'resolving' notification when already in 'resolving' state
2. Improve: `on()` should accept a state filter parameter

## Solution {#adr-009-solution}

### Part 1: Fix Duplicate Notifications

Modify `doResolve()` to skip the 'resolving' state change and notification if already in 'resolving' state.

**After fix:**

```
doInvalidate() ─┬─► state = 'resolving'
                ├─► notifyListeners('resolving')  ← 1st
                └─► resolve()
                      └─► doResolve()
                            ├─► skip (already resolving)
                            ├─► factory()
                            ├─► state = 'resolved'
                            └─► notifyListeners('resolved') ← 2nd
```

### Part 2: Improve Controller.on() API

Change the signature to require an explicit state filter:

```typescript
interface Controller<T> {
  on(event: 'resolving' | 'resolved' | '*', listener: () => void): () => void
}
```

**Usage:**

```typescript
// Listen to resolved only (most common)
ctl.on('resolved', () => {
  console.log('Value:', ctl.get())
})

// Listen to resolving only
ctl.on('resolving', () => {
  console.log('Loading...')
})

// Listen to all state changes
ctl.on('*', () => {
  console.log('State:', ctl.state)
})
```

## Changes Across Layers {#adr-009-changes}

### Component Level
- [c3-201](../c3-2-lite/c3-201-scope.md):
  - Update Controller interface with new `on()` signature
  - Update "Subscribing to Changes" section with examples
  - Update Invalidation section to clarify notification count

## Implementation {#adr-009-implementation}

### types.ts

```typescript
export interface Controller<T> {
  readonly [controllerSymbol]: true
  readonly state: AtomState
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
  invalidate(): void
  on(event: ControllerEvent, listener: () => void): () => void
}
```

### scope.ts - AtomEntry

```typescript
interface AtomEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  listeners: Map<'resolving' | 'resolved' | '*', Set<() => void>>  // Changed from Set
  pendingInvalidate: boolean
  data?: Map<string, unknown>
}
```

### scope.ts - ControllerImpl

```typescript
class ControllerImpl<T> implements Lite.Controller<T> {
  // ...

  on(event: ListenerEvent, listener: () => void): () => void {
    return this.scope.addListener(this.atom, event, listener)
  }
}
```

### scope.ts - ScopeImpl

```typescript
private getOrCreateEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> {
  let entry = this.cache.get(atom) as AtomEntry<T> | undefined
  if (!entry) {
    entry = {
      state: 'idle',
      hasValue: false,
      cleanups: [],
      listeners: new Map([
        ['resolving', new Set()],
        ['resolved', new Set()],
        ['*', new Set()],
      ]),
      pendingInvalidate: false,
    }
    this.cache.set(atom, entry as AtomEntry<unknown>)
  }
  return entry
}

addListener<T>(
  atom: Lite.Atom<T>,
  state: 'resolving' | 'resolved' | '*',
  listener: () => void
): () => void {
  const entry = this.getOrCreateEntry(atom)
  const listeners = entry.listeners.get(state)!
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

private notifyListeners<T>(atom: Lite.Atom<T>, state: 'resolving' | 'resolved'): void {
  const entry = this.cache.get(atom)
  if (!entry) return

  const stateListeners = entry.listeners.get(state)
  if (stateListeners) {
    for (const listener of stateListeners) {
      listener()
    }
  }

  const allListeners = entry.listeners.get('*')
  if (allListeners) {
    for (const listener of allListeners) {
      listener()
    }
  }
}

private async doResolve<T>(atom: Lite.Atom<T>): Promise<T> {
  const entry = this.getOrCreateEntry(atom)

  const wasResolving = entry.state === 'resolving'
  if (!wasResolving) {
    entry.state = 'resolving'
    this.emitStateChange('resolving', atom)
    this.notifyListeners(atom, 'resolving')
  }

  // ... deps resolution and ctx creation unchanged ...

  try {
    const value = await this.applyResolveExtensions(atom, doResolve)
    entry.state = 'resolved'
    entry.value = value
    entry.hasValue = true
    entry.error = undefined
    this.emitStateChange('resolved', atom)
    this.notifyListeners(atom, 'resolved')

    // ... pendingInvalidate handling unchanged ...

    return value
  } catch (err) {
    entry.state = 'failed'
    entry.error = err instanceof Error ? err : new Error(String(err))
    entry.value = undefined
    entry.hasValue = false
    this.emitStateChange('failed', atom)
    this.notifyAllListeners(atom)  // Only notify '*' listeners on failure

    // ... rest unchanged ...
  }
}

private notifyAllListeners<T>(atom: Lite.Atom<T>): void {
  const entry = this.cache.get(atom)
  if (!entry) return

  const allListeners = entry.listeners.get('*')
  if (allListeners) {
    for (const listener of allListeners) {
      listener()
    }
  }
}

private async doInvalidate<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>): Promise<void> {
  // ... cleanup unchanged ...

  entry.state = 'resolving'
  // ... rest unchanged ...
  this.emitStateChange('resolving', atom)
  this.notifyListeners(atom, 'resolving')

  this.resolve(atom).catch(() => {})
}
```

## Verification {#adr-009-verification}

- [x] Self-invalidating atom notifies listeners exactly 2x per cycle
- [x] First resolution (idle → resolving → resolved) notifies 2x
- [x] External `controller.invalidate()` notifies 2x
- [x] `ctl.on('resolved', ...)` fires only on resolved
- [x] `ctl.on('resolving', ...)` fires only on resolving
- [x] `ctl.on('*', ...)` fires on both (resolving + resolved)
- [x] `scope.on('resolving', ...)` fires exactly once per invalidation
- [x] `scope.on('resolved', ...)` fires exactly once per invalidation
- [x] On failure, only '*' listeners fire (not 'resolved')
- [x] All 105 tests pass

## Test Cases {#adr-009-test}

Tests are located in `packages/lite/tests/scope.test.ts` under `describe("controller.on()")`.

```typescript
describe('Controller.on() state filtering', () => {
  it('filters by state - only notifies resolved listeners on resolved', async () => {
    const scope = createScope()
    const calls: string[] = []

    const myAtom = atom({ factory: () => 'value' })
    const ctl = scope.controller(myAtom)

    ctl.on('resolving', () => calls.push('resolving'))
    ctl.on('resolved', () => calls.push('resolved'))
    ctl.on('*', () => calls.push('*'))

    await ctl.resolve()

    expect(calls).toEqual(['resolving', '*', 'resolved', '*'])
  })

  it('notifies exactly twice per invalidation cycle', async () => {
    const scope = createScope()
    const calls: string[] = []

    const myAtom = atom({ factory: () => 'value' })
    const ctl = scope.controller(myAtom)
    await ctl.resolve()

    ctl.on('resolving', () => calls.push('resolving'))
    ctl.on('resolved', () => calls.push('resolved'))

    ctl.invalidate()
    await new Promise(r => setTimeout(r, 50))

    expect(calls).toEqual(['resolving', 'resolved'])
  })

  it("only notifies '*' listeners on failed state, not 'resolved'", async () => {
    const scope = createScope()
    const calls: string[] = []

    const failingAtom = atom({
      factory: () => { throw new Error("intentional failure") }
    })

    const ctl = scope.controller(failingAtom)

    ctl.on('resolving', () => calls.push('resolving'))
    ctl.on('resolved', () => calls.push('resolved'))
    ctl.on('*', () => calls.push('*'))

    await expect(ctl.resolve()).rejects.toThrow("intentional failure")

    expect(calls).toEqual(['resolving', '*', '*'])  // No 'resolved' on failure
  })
})
```

## Related {#adr-009-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller
- [ADR-003](./adr-003-controller-reactivity.md) - Controller-based Reactivity
