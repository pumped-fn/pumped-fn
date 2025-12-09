---
id: adr-017
title: Controller Auto-Resolution Option
summary: >
  Add optional { resolve: true } flag to controller() helper that auto-resolves
  the atom before passing the controller to the factory, eliminating the need
  for redundant atom+controller deps or manual resolve() calls.
status: accepted
date: 2025-12-09
---

# [ADR-017] Controller Auto-Resolution Option

## Status {#adr-017-status}
**Accepted** - 2025-12-09

## Problem/Requirement {#adr-017-problem}

When an atom factory needs both the resolved value AND reactive controller capabilities (subscriptions, invalidation, set/update), users must choose between two verbose patterns:

**Pattern A: Redundant dependencies**
```typescript
const myAtom = atom({
  deps: {
    config: configAtom,              // for the value
    configCtrl: controller(configAtom)  // for reactivity
  },
  factory: (ctx, { config, configCtrl }) => {
    configCtrl.on('resolved', () => ctx.invalidate())
    return config.port
  }
})
```

**Pattern B: Manual resolve**
```typescript
const myAtom = atom({
  deps: { ctrl: controller(configAtom) },
  factory: async (ctx, { ctrl }) => {
    await ctrl.resolve()  // extra step, makes factory async
    const config = ctrl.get()
    ctrl.on('resolved', () => ctx.invalidate())
    return config.port
  }
})
```

Both patterns add friction to a common use case: subscribing to an atom's changes while also needing its current value.

## Exploration Journey {#adr-017-exploration}

**Initial hypothesis:** This affects the `controller()` helper in atom.ts and the dependency resolution logic in scope.ts.

**Explored:**
- **Isolated:** `controller()` creates a marker object with `[controllerSymbol]: atom`; `resolveDeps()` in scope.ts creates `ControllerImpl` from it
- **Upstream:** No upstream dependencies affected - purely additive
- **Adjacent:** `ControllerDep` type in types.ts needs extension for the new field
- **Downstream:** No downstream consumers affected - backward compatible, existing code unchanged

**Discovered:** The change is well-contained. The marker object can carry an additional `resolve` flag, and `resolveDeps()` can check it before returning the controller.

**Alternatives considered:**
1. **Separate helper (`resolvedController()`)** - More explicit but adds API surface
2. **Different symbol** - Unnecessary complexity
3. **Wrapper function** - More verbose than a flag

Flag on existing `controller()` was chosen for minimal API surface and backward compatibility.

## Solution {#adr-017-solution}

Add an optional `options` parameter to `controller()`:

```typescript
interface ControllerOptions {
  resolve?: boolean
}

function controller<T>(
  atom: Atom<T>,
  options?: ControllerOptions
): ControllerDep<T>
```

When `{ resolve: true }` is passed, the dependency resolution system will:
1. Create the controller as normal
2. Call `await ctrl.resolve()` before passing to the factory
3. Return the same `Controller<T>` type (no type narrowing)

**Usage:**
```typescript
const myAtom = atom({
  deps: { ctrl: controller(configAtom, { resolve: true }) },
  factory: (ctx, { ctrl }) => {
    const config = ctrl.get()  // safe - already resolved
    ctrl.on('resolved', () => ctx.invalidate())
    return config.port
  }
})
```

**Behavior:**
- `controller(atom)` - Returns controller in `idle` state (existing behavior)
- `controller(atom, { resolve: true })` - Returns controller in `resolved` state

## Changes Across Layers {#adr-017-changes}

### Component Level

**c3-202 (Atom):**
- Update `controller()` signature to accept optional `ControllerOptions`
- Store `resolve` flag in the marker object
- Document the new option in Controller Dependency section

**c3-201 (Scope & Controller):**
- Update `resolveDeps()` to check `resolve` flag on controller deps
- If true, await `ctrl.resolve()` before adding to results
- Document behavior in Controller Usage section

### Source Files

| File | Change |
|------|--------|
| `src/atom.ts` | Add `ControllerOptions` interface, update `controller()` to accept and store options |
| `src/types.ts` | Add `resolve?: boolean` to `ControllerDep` interface |
| `src/scope.ts` | Check `resolve` flag in `resolveDeps()`, await resolution if true |

## Verification {#adr-017-verification}

- [x] `controller(atom)` returns idle controller (backward compatible)
- [x] `controller(atom, { resolve: true })` returns resolved controller
- [x] `ctrl.get()` works immediately with `{ resolve: true }`
- [x] `ctrl.on()`, `ctrl.invalidate()`, `ctrl.set()`, `ctrl.update()` work normally
- [x] Resolution only happens once (caching preserved)
- [x] Error propagation works if underlying atom fails

## Related {#adr-017-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller component
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom component with controller() helper
- [ADR-003](./adr-003-controller-reactivity.md) - Original Controller design
