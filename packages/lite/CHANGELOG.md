# @pumped-fn/lite

## 0.2.0

### Minor Changes

- de1382f: Add `scope.select()` for fine-grained reactivity with selector and equality-based change detection.

  - `SelectHandle<S>` provides `get()` and `subscribe()` for derived subscriptions
  - Default reference equality (`===`) with optional custom `eq` function
  - Auto-cleanup when last subscriber unsubscribes
  - Designed for React 18+ `useSyncExternalStore` compatibility

## 0.1.0

### Minor Changes

- 6dfd919: Add @pumped-fn/lite - lightweight DI with minimal reactivity

  Lightweight dependency injection for TypeScript with:

  - `atom()` - long-lived dependencies with lifecycle
  - `flow()` - short-lived execution with input
  - `tag()` - metadata attachment/extraction
  - `controller()` - deferred resolution with reactivity
  - `createScope()` - container with resolution caching
  - Extension system for cross-cutting concerns

  Reactivity features (ADR-003):

  - `AtomState`: idle | resolving | resolved | failed
  - `ctx.invalidate()` - self-invalidation from factory
  - `Controller.invalidate()` / `Controller.on()` - external control
  - `scope.on()` - event listening for state transitions

  Zero external dependencies, <10KB bundle target.
