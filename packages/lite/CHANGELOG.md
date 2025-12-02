# @pumped-fn/lite

## 1.2.0

### Minor Changes

- 4ca110a: Add `typed<T>()` utility for type-only flow input marking

  - Add `typed<T>()` function that provides typed input without runtime parsing
  - Fix type inference for `ctx.input` when using `parse` function - now correctly infers the parsed type
  - Add `Lite.Typed<T>` interface and `typedSymbol` for the type marker

  **Before:** Required explicit type annotation on factory callback

  ```typescript
  const myFlow = flow({
    parse: (raw: unknown): MyType => validate(raw),
    factory: (ctx: Lite.ExecutionContext<MyType>) => ctx.input.field,
  });
  ```

  **After:** Type is automatically inferred from parse return type

  ```typescript
  const myFlow = flow({
    parse: (raw: unknown): MyType => validate(raw),
    factory: (ctx) => ctx.input.field, // ctx.input is MyType
  });
  ```

  **New:** Use `typed<T>()` for type-only marking without validation

  ```typescript
  const myFlow = flow({
    parse: typed<{ name: string }>(),
    factory: (ctx) => ctx.input.name, // ctx.input is { name: string }
  });
  ```

## 1.1.0

### Minor Changes

- 2dd9ee9: Add parse functions for Tag and Flow with full type inference

  - Add `parse` property to Tag for runtime validation (sync-only)
  - Add `parse` property to Flow for input validation (async-supported)
  - Add `ParseError` class with structured error context (phase, label, cause)
  - Add optional `name` property to Flow for better error messages
  - Type inference: `TInput` automatically inferred from parser return type

- ee381f5: Add sequential invalidation chain with loop detection

  - Invalidations now execute sequentially in dependency order (A → B → C)
  - Infinite loop detection throws with helpful error message showing chain path
  - New `scope.flush()` method to await pending invalidations
  - State transitions now happen AFTER cleanups complete (matching C3-201 docs)
  - Self-invalidation during factory execution remains deferred (poll-and-refresh pattern)

## 1.0.1

### Patch Changes

- 9ee6ac2: Add comprehensive README documentation for release

  - Add installation instructions
  - Add quick start guide with complete example
  - Document all core concepts (Atoms, Flows, Controllers, Tags, Presets, Extensions)
  - Add lifecycle diagrams (state machine, resolution flow, invalidation flow)
  - Add complete API reference tables
  - Add comparison with @pumped-fn/core-next
  - Add guidance on when to choose lite vs core-next

- 219fce4: Update MIGRATION.md with accurate API documentation

  - Add Controller.on() event filtering (`'resolved'`, `'resolving'`, `'*'`)
  - Add scope.select() fine-grained subscription example
  - Add Fine-grained select() to feature comparison table
  - Fix Quick Reference table with event filtering syntax

## 1.0.0

### Major Changes

- f5dc22f: **BREAKING**: `createScope()` now returns `Scope` synchronously instead of `Promise<Scope>`.

  Migration:

  ```typescript
  // Before
  const scope = await createScope();

  // After
  const scope = createScope();
  // resolve() waits for ready internally, or use:
  await scope.ready;
  ```

  **BREAKING**: `Controller.on()` now requires explicit event type.

  Migration:

  ```typescript
  // Before
  ctl.on(() => { ... })

  // After
  ctl.on('resolved', () => { ... })  // Most common: react to new values
  ctl.on('resolving', () => { ... }) // Loading states
  ctl.on('*', () => { ... })         // All state changes
  ```

  Other changes:

  - Fix duplicate listener notifications (was 3x per invalidation, now 2x)
  - On failed state, only `'*'` listeners are notified (not `'resolved'`)

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
