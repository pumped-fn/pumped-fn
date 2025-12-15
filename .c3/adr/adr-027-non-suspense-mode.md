---
id: adr-027
title: Non-Suspense Mode for useAtom
summary: >
  Add { suspense: false } option to useAtom returning UseAtomState<T> for
  imperative loading/error handling without Suspense boundaries.
status: accepted
date: 2025-12-11
---

# [ADR-027] Non-Suspense Mode for useAtom

## Status {#adr-027-status}
**Accepted** - 2025-12-11

## Problem/Requirement {#adr-027-problem}

`useAtom` requires Suspense and ErrorBoundary wrappers for loading/error states. Some use cases need imperative control:

- Inline loading indicators (not boundary-based)
- Error handling within the component
- Gradual migration from other state libraries
- Components where Suspense boundaries are impractical

## Exploration Journey {#adr-027-exploration}

**Initial hypothesis:** Add a mode flag that returns state object instead of throwing.

**Explored:**
- TanStack Query pattern: `{ data, isLoading, error }` - widely understood
- Jotai's `loadable()` wrapper - creates derived atom
- Direct state mapping from Controller's 4 states

**Discovered:** The Controller already tracks all necessary state. Non-Suspense mode is a different **rendering strategy** for the same underlying state machine.

**Design tension:** C3-301 states "Hooks observe, don't trigger." Non-Suspense mode with `resolve: true` needs to imperatively start resolution - a side effect.

**Resolution:** This is an opt-in escape hatch. Users choosing `{ suspense: false, resolve: true }` explicitly request imperative behavior. Document the exception.

## Solution {#adr-027-solution}

Add `{ suspense: false }` option to `useAtom`:

```typescript
interface UseAtomState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  controller: Lite.Controller<T>
}

function useAtom<T>(atom: Atom<T>, options: { suspense: false }): UseAtomState<T>
function useAtom<T>(atom: Atom<T>, options: { suspense: false, resolve: true }): UseAtomState<T>
```

**State mapping:**

| Controller State | `data` | `loading` | `error` |
|------------------|--------|-----------|---------|
| `idle` | `undefined` | `false` | `undefined` |
| `resolving` | `undefined` | `true` | `undefined` |
| `resolved` | value | `false` | `undefined` |
| `failed` | `undefined` | `false` | Error |

**Resolve option:**

| Option | Behavior |
|--------|----------|
| `{ suspense: false }` | Returns state, no auto-resolve |
| `{ suspense: false, resolve: true }` | Returns state, triggers resolve on mount |

**Why different defaults:** Suspense mode defaults `resolve: true` (declarative). Non-Suspense mode defaults `resolve: false` (imperative control expected).

## Implementation {#adr-027-implementation}

`useAtomState` helper handles non-Suspense rendering:

1. **Cache for referential stability** - Ref stores previous `{ ctrlState, data, error, result }`. Returns cached result if inputs unchanged.

2. **Auto-resolve via useEffect** - When `resolve: true`, triggers resolution on mount. This is the documented exception to "observe not trigger."

3. **Subscribe to all events** - Uses `ctrl.on('*')` since any state change is relevant.

## Changes Across Layers {#adr-027-changes}

### Component Level

**c3-301 (React Hooks):**
- Add `UseAtomState<T>` interface
- Add overloaded signatures for `{ suspense: false }`
- Document state mapping table
- Document "observe not trigger" exception for `resolve: true`

### Source Files

| File | Change |
|------|--------|
| `packages/lite-react/src/hooks.ts` | Add `useAtomState`, option types, overloads |

## Verification {#adr-027-verification}

- [x] `useAtom(atom)` returns `T` (backward compatible)
- [x] `useAtom(atom, { suspense: false })` returns `UseAtomState<T>`
- [x] State maps correctly for all 4 controller states
- [x] `resolve: true` triggers resolution on mount
- [x] Re-renders on any state change
- [x] Referential stability via cache

## Related {#adr-027-related}

- [c3-301](../c3-3-lite-react/c3-301-hooks.md) - React hooks documentation
- [ADR-019](./adr-019-scope-controller-options.md) - Controller resolve options
