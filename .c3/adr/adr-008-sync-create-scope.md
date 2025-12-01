---
id: ADR-008-sync-create-scope
title: Synchronous createScope with Ready Promise
summary: >
  Change createScope() from async function to sync function that returns
  a Scope with a `ready` promise property for extension initialization.
status: accepted
date: 2025-12-01
---

# [ADR-008] Synchronous createScope with Ready Promise

## Status {#adr-008-status}
**Accepted** - 2025-12-01

## Problem/Requirement {#adr-008-problem}

Currently `createScope()` is async:

```typescript
const scope = await createScope()
```

This forces all consuming code to be async even when no extensions require initialization. The async nature exists solely to support extensions with async `init()` hooks.

**User expectation**: `createScope()` should be synchronous. If async initialization is needed, it should be exposed as a separate property.

## Exploration Journey {#adr-008-exploration}

**Initial hypothesis:** The async is required for extension `init()` hooks.

**Explored:**
- Isolated: `createScope` in `scope.ts:589-595` - calls `await scope.init()`
- Upstream: `Extension.init()` in `types.ts:141` - returns `MaybePromise<void>`
- Adjacent: Other scope methods like `dispose()` are already async without blocking construction
- Downstream: All user code must use `await createScope()` or `.then()`

**Discovered:**
- Extensions can have async `init()` but this shouldn't block scope creation
- The scope is usable immediately; extensions just need to be ready before resolution
- Pattern exists in other DI systems: return object with `ready` promise

**Confirmed:**
- Scope can be returned synchronously
- Extension initialization can happen in background
- Resolution should wait for `ready` if not yet resolved

## Solution {#adr-008-solution}

Change `createScope()` to return `Scope` synchronously with a `ready: Promise<void>` property:

```typescript
function createScope(options?: ScopeOptions): Scope

interface Scope {
  readonly ready: Promise<void>  // Resolves when extensions are initialized
  // ... existing methods
}
```

**Usage patterns:**

```typescript
// Sync creation, explicit wait when needed
const scope = createScope()
await scope.ready
const value = await scope.resolve(myAtom)

// Or rely on resolve() to wait internally
const scope = createScope()
const value = await scope.resolve(myAtom)  // Waits for ready automatically
```

**Implementation approach:**
1. `createScope()` returns `ScopeImpl` immediately
2. `ScopeImpl.ready` is a promise that calls `init()` on extensions
3. `resolve()` internally awaits `ready` before proceeding

## Changes Across Layers {#adr-008-changes}

### Container Level
- [c3-2](../c3-2-lite/README.md): Update Public API table - `createScope()` returns `Scope` not `Promise<Scope>`

### Component Level
- [c3-201](../c3-2-lite/c3-201-scope.md):
  - Update `createScope` signature
  - Add `ready` property to Scope interface
  - Document the initialization pattern

## Implementation {#adr-008-implementation}

### types.ts

```typescript
export interface Scope {
  readonly ready: Promise<void>  // NEW: resolves when extensions initialized
  resolve<T>(atom: Atom<T>): Promise<T>
  // ... rest unchanged
}
```

### scope.ts

```typescript
class ScopeImpl implements Lite.Scope {
  readonly ready: Promise<void>
  private initialized = false

  constructor(options?: Lite.ScopeOptions) {
    // ... existing constructor code ...

    this.ready = this.init().then(() => {
      this.initialized = true
    })
  }

  private async init(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.init) {
        await ext.init(this)
      }
    }
  }

  async resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    if (!this.initialized) {
      await this.ready
    }
    // ... existing resolve logic ...
  }
}

export function createScope(options?: Lite.ScopeOptions): Lite.Scope {
  return new ScopeImpl(options)
}
```

## Verification {#adr-008-verification}

- [ ] `createScope()` returns synchronously (no await needed)
- [ ] `scope.ready` is a Promise that resolves after extensions init
- [ ] `scope.resolve()` waits for ready internally
- [ ] Existing tests pass with updated signature
- [ ] No breaking changes for code that already awaits createScope

## Migration {#adr-008-migration}

**Before:**
```typescript
const scope = await createScope()
```

**After (both work):**
```typescript
// Option 1: Direct usage (resolve waits internally)
const scope = createScope()
const value = await scope.resolve(myAtom)

// Option 2: Explicit wait
const scope = createScope()
await scope.ready
const value = await scope.resolve(myAtom)
```

**Breaking change:** Code using `createScope().then(scope => ...)` needs update since `createScope()` no longer returns a Promise.

## Related {#adr-008-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller
- [c3-2](../c3-2-lite/README.md) - Lite Library overview
