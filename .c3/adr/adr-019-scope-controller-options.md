---
id: adr-019
title: Scope.controller() Options for API Consistency
summary: >
  Add optional { resolve: true } flag to scope.controller() to match the
  controller() dependency helper, eliminating API inconsistency and enabling
  the same convenience pattern outside of atom dependencies.
status: accepted
date: 2025-12-11
---

# [ADR-019] Scope.controller() Options for API Consistency

## Status {#adr-019-status}
**Accepted** - 2025-12-11

## Problem/Requirement {#adr-019-problem}

ADR-017 added `{ resolve: true }` option to the `controller()` helper for use in atom dependencies:

```typescript
const myAtom = atom({
  deps: { ctrl: controller(configAtom, { resolve: true }) },
  factory: (ctx, { ctrl }) => {
    ctrl.get()  // safe - already resolved
  }
})
```

However, `scope.controller()` (the direct method to obtain a controller from a scope) lacks this option:

```typescript
// Current API - no options
const ctrl = scope.controller(configAtom)
await ctrl.resolve()  // Must call manually
const value = ctrl.get()
```

This creates an API inconsistency - two ways to get a controller, but only one supports the `{ resolve: true }` convenience.

## Exploration Journey {#adr-019-exploration}

**Initial hypothesis:** This is a contained change to c3-201 (Scope & Controller) following the pattern established in ADR-017.

**Explored:**
- **Isolated:** `scope.controller()` in scope.ts (line 543-545) - currently `controller<T>(atom: Atom<T>): Controller<T>`
- **Upstream:** `Lite.Scope` interface in types.ts needs signature update
- **Adjacent:** `controller()` helper in atom.ts already implements the pattern we need to mirror
- **Downstream:** `useController` hook in lite-react could also benefit from this option

**Discovered:** The change is well-contained. The implementation pattern from `resolveDeps()` (check flag, await resolution) can be applied directly to `scope.controller()`.

**Key insight:** Unlike the dependency case where resolution happens during dep resolution, `scope.controller()` would need to return `Promise<Controller<T>>` when `{ resolve: true }` is specified, since resolution is async.

## Solution {#adr-019-solution}

Add optional `options` parameter to `scope.controller()` with conditional return type:

```typescript
interface Scope {
  controller<T>(atom: Atom<T>): Controller<T>
  controller<T>(atom: Atom<T>, options: { resolve: true }): Promise<Controller<T>>
  controller<T>(atom: Atom<T>, options?: ControllerOptions): Controller<T> | Promise<Controller<T>>
}
```

**Behavior:**
- `scope.controller(atom)` - Returns `Controller<T>` immediately (existing behavior)
- `scope.controller(atom, { resolve: true })` - Returns `Promise<Controller<T>>` that resolves to a resolved controller

**Usage:**
```typescript
// Without options (existing)
const ctrl = scope.controller(configAtom)
await ctrl.resolve()

// With resolve option (new)
const ctrl = await scope.controller(configAtom, { resolve: true })
ctrl.get()  // safe - already resolved
```

**React integration (optional enhancement):**
```typescript
function useController<T>(atom: Atom<T>): Controller<T>
function useController<T>(
  atom: Atom<T>,
  options: { resolve: true }
): Controller<T>  // Still sync, throws promise for Suspense

// Usage with Suspense
const ctrl = useController(configAtom, { resolve: true })
```

## Changes Across Layers {#adr-019-changes}

### Component Level

**c3-201 (Scope & Controller):**
- Update `Scope.controller()` signature to accept optional `ControllerOptions`
- Add overloaded signatures for type narrowing
- Document async return type when `{ resolve: true }`
- Update examples in Controller Usage section

**c3-301 (React Hooks) - Optional:**
- Update `useController()` to accept optional options
- When `{ resolve: true }`, throw promise for Suspense if not resolved
- Document usage pattern

### Container Level

**c3-2 (Lite Library):**
- Update Public API section with new signature

**c3-3 (Lite React Library) - Optional:**
- Update Public API section if useController is enhanced

### Source Files

| File | Change |
|------|--------|
| `packages/lite/src/types.ts` | Add overloaded `controller()` signatures to `Scope` interface |
| `packages/lite/src/scope.ts` | Implement options handling in `controller()` method |
| `packages/lite-react/src/hooks.ts` | (Optional) Add options to `useController()` |

## Verification {#adr-019-verification}

- [x] `scope.controller(atom)` returns `Controller<T>` immediately (backward compatible)
- [x] `scope.controller(atom, { resolve: true })` returns `Promise<Controller<T>>`
- [x] Returned controller is in `resolved` state after await
- [x] `ctrl.get()` works immediately with resolved controller
- [x] Type narrowing works correctly with overloads
- [x] Resolution caching preserved (same atom = same controller)
- [ ] (Optional) `useController(atom, { resolve: true })` integrates with Suspense

## Related {#adr-019-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller component
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom component with controller() helper
- [c3-301](../c3-3-lite-react/c3-301-hooks.md) - React hooks including useController
- [ADR-017](./adr-017-controller-auto-resolution.md) - Original { resolve: true } design for controller() helper
- [ADR-003](./adr-003-controller-reactivity.md) - Original Controller design
