# @pumped-fn/lite

## 1.11.0

### Minor Changes

- 60604a2: Add automatic garbage collection for atoms

  - Atoms are automatically released when they have no subscribers after a configurable grace period (default 3000ms)
  - Cascading GC: dependencies are protected while dependents are mounted
  - New `keepAlive: true` option on atoms to prevent auto-release
  - New `gc: { enabled, graceMs }` option on `createScope()` to configure or disable GC
  - React Strict Mode compatible via grace period (handles double-mount/unmount)
  - Disable with `createScope({ gc: { enabled: false } })` to preserve pre-1.11 behavior

- 06d527f: Add utility types for better DX and boundary types for extensions

  - Add `Lite.Utils` namespace with type extraction utilities:
    - `AtomValue<A>`, `FlowOutput<F>`, `FlowInput<F>`, `TagValue<T>`, `ControllerValue<C>`
    - `DepsOf<T>`, `Simplify<T>`, `AtomType<T, D>`, `FlowType<O, I, D>`
  - Add boundary types for passthrough extension code:
    - `AnyAtom`, `AnyFlow`, `AnyController`
  - Add `ExecTarget` and `ExecTargetFn` type aliases for cleaner extension signatures

### Patch Changes

- a017021: docs: add Flow Deps & Execution pattern and improve documentation

  - Add "Flow Deps & Execution" section to PATTERNS.md covering:
    - Deps resolution (atoms from Scope vs tags from context hierarchy)
    - Service invocation via ctx.exec (observable by extensions)
    - Cleanup pattern with ctx.onClose (pessimistic cleanup)
  - Remove redundant patterns (Command, Interceptor) covered by composite patterns
  - Remove verbose Error Boundary diagram, replaced with bullet point
  - Add Documentation section to README linking PATTERNS.md and API reference

## 1.10.0

### Minor Changes

- d227191: Add tag and atom registries for automatic tracking

  - Add `tag.atoms()` method to query all atoms that use a specific tag
  - Add `getAllTags()` function to query all created tags
  - Tagged values now include a `tag` reference to their parent Tag
  - Uses WeakRef for memory-efficient tracking (tags and atoms can be GC'd)
  - Automatic registration when `tag()` and `atom()` are called

## 1.9.2

### Patch Changes

- 8a5e509: Add `name` option to function execution for API consistency

  When executing functions via `ctx.exec({ fn, params })`, you can now provide an explicit `name` option for better observability:

  ```typescript
  await ctx.exec({
    fn: async (ctx, id) => fetchData(id),
    params: ["123"],
    name: "fetchUserData",
  });
  ```

  Name resolution priority: `options.name` > `fn.name` > `undefined`

  This matches the existing `name` option on flow execution, enabling consistent naming for tracing and debugging.

## 1.9.1

### Patch Changes

- e774247: Expose function params as `ctx.input` for extensions

  When executing functions via `ctx.exec({ fn, params })`, the `params` array is now available on `ctx.input`. This enables extensions to access function arguments consistently with flow input.

  - Flows: `ctx.input` = parsed input value
  - Functions: `ctx.input` = params array

## 1.9.0

### Minor Changes

- 9e1f827: Add `name` property to ExecutionContext for extension visibility

  - ExecutionContext now exposes `name: string | undefined` (lazy-computed)
  - Name resolution: exec name > flow name > undefined
  - OTEL extension uses `ctx.name` with configurable `defaultFlowName` fallback

## 1.8.0

### Minor Changes

- 36105b0: Add `seek()` and `seekTag()` methods to `ContextData` for hierarchical data lookup across ExecutionContext parent chain. Also add PATTERNS.md architectural documentation and include MIGRATION.md in package.

## 1.7.0

### Minor Changes

- 421f017: Unify `ResolveContext.data` and `ExecutionContext.data` into a single `ContextData` interface

  **Breaking Change:** Tag-based methods renamed:

  - `get(tag)` → `getTag(tag)`
  - `set(tag, value)` → `setTag(tag, value)`
  - `has(tag)` → `hasTag(tag)`
  - `delete(tag)` → `deleteTag(tag)`
  - `getOrSet(tag)` → `getOrSetTag(tag)`

  **New:** Raw Map operations available on both contexts:

  - `get(key: string | symbol)` → raw lookup
  - `set(key: string | symbol, value)` → raw store
  - `has(key: string | symbol)` → raw check
  - `delete(key: string | symbol)` → raw delete
  - `clear()` → remove all

  This allows extensions to use simple `symbol` keys while user code benefits from type-safe Tag-based methods.

### Patch Changes

- 862cb5b: Widen `ExecutionContext.data` type from `Map<symbol, unknown>` to `Map<string | symbol, unknown>` for more flexible key usage

## 1.6.0

### Minor Changes

- 97ef8b0: Add controller auto-resolution option

  - Add `{ resolve: true }` option to `controller()` helper
  - When set, the controller is auto-resolved before the factory runs
  - Eliminates need for redundant atom+controller deps or manual `resolve()` calls

  ```typescript
  const myAtom = atom({
    deps: { config: controller(configAtom, { resolve: true }) },
    factory: (ctx, { config }) => {
      config.get(); // safe - already resolved
    },
  });
  ```

## 1.5.1

### Patch Changes

- 22c5807: fix: simplify service to be narrowed atom with type constraint

  **BREAKING**: Removed `Service<T>` interface, `isService()`, and `serviceSymbol`

  - `service()` now returns `Atom<T extends ServiceMethods>` directly
  - Use `isAtom()` instead of `isService()` for type guards
  - Removed `ServiceFactory` type - uses `AtomFactory` instead

  The `ServiceMethods` constraint ensures methods match the `(ctx: ExecutionContext, ...args) => result`
  signature that `ctx.exec({ fn, params })` expects. This is enforced at compile time.

  Migration:

  - Replace `Lite.Service<T>` with `Lite.Atom<T>` where `T extends Lite.ServiceMethods`
  - Replace `isService(value)` with `isAtom(value)`

## 1.5.0

### Minor Changes

- d2f20ab: Add `service()` for context-aware method containers

  - New `service()` factory function for defining services with multiple methods
  - Each method receives `ExecutionContext` as first parameter (auto-injected)
  - Services are resolved as singletons per scope (same as atoms)
  - Service methods invoked via `ctx.exec({ fn, params })` for extension wrapping
  - New `isService()` type guard and `serviceSymbol` for identification
  - `Scope.resolve()` now accepts both `Atom<T>` and `Service<T>`

  **BREAKING:** `ctx.exec({ fn, params })` now auto-injects `ExecutionContext` as first argument.
  Functions passed to `ctx.exec()` must have `(ctx, ...args)` signature.
  Only pass remaining args in `params` - ctx is injected automatically.

  **Migration:** Find and update all `ctx.exec({ fn, params: [ctx, ...] })` calls:

  ```bash
  grep -r "params:.*\[ctx" --include="*.ts" .
  ```

  Remove `ctx` from params array - it's now auto-injected.

  Example:

  ```typescript
  const dbService = service({
    deps: { pool: poolAtom },
    factory: (ctx, { pool }) => ({
      query: (ctx, sql: string) => pool.query(sql),
      transaction: (ctx, fn) => pool.withTransaction(fn),
    }),
  });

  const db = await scope.resolve(dbService);
  await ctx.exec({ fn: db.query, params: ["SELECT 1"] });
  ```

- 5aafa42: Add hierarchical ExecutionContext with parent-child relationship per exec() call

  **Breaking Changes:**

  1. **`onClose()` timing changed**: Cleanup callbacks now run immediately when `exec()` completes (child auto-close), not when root context is manually closed.

  2. **`ctx.input` isolation**: Each child context has its own isolated input. Root context input remains undefined. Previously, input was mutated on the shared context.

  3. **Captured context behavior**: A context captured in setTimeout/callbacks will be closed after the parent `exec()` returns. Calling `exec()` on a closed context throws "ExecutionContext is closed".

  **New Features:**

  - `ctx.parent`: Reference to parent ExecutionContext (undefined for root)
  - `ctx.data`: Per-context `Map<symbol, unknown>` for extension data storage
  - Child contexts auto-close after exec completes
  - Enables nested span tracing without AsyncLocalStorage

## 1.4.1

### Patch Changes

- 3f3fea8: fix(lite): improve ExecutionContext and ExecFlowOptions type inference

  **Type System Improvements:**

  - Remove unnecessary `TInput` generic from `ExecutionContext` interface
  - Add proper output/input type inference to `ExecFlowOptions<Output, Input>`
  - Make `input` property optional for void/undefined/null input flows
  - Update `FlowFactory` to use intersection type for input typing
  - Simplify `Extension.wrapResolve` and `wrapExec` to use `unknown`
  - Flows without `parse` now return `Flow<Output, void>` for better DX

  **DX Improvements:**

  ```typescript
  // No input needed for void flows - clean DX
  ctx.exec({ flow: voidFlow });

  // Input required and type-checked for typed flows
  ctx.exec({ flow: inputFlow, input: "hello" });
  ```

  **Test Consolidation:**

  - Reduced test count from 149 to 130 (-13%)
  - Removed duplicate and superficial tests
  - Consolidated similar test patterns

## 1.4.0

### Minor Changes

- bbcada9: feat(lite): add Controller.set() and Controller.update() for direct value mutation

  Adds two new methods to Controller for pushing values directly without re-running the factory:

  - `controller.set(value)` - Replace value directly
  - `controller.update(fn)` - Transform value using a function

  Both methods:

  - Use the same invalidation queue as `invalidate()`
  - Run cleanups in LIFO order before applying new value
  - Transition through `resolving → resolved` states
  - Notify all subscribed listeners

  This enables patterns like WebSocket updates pushing values directly into atoms without triggering factory re-execution.

  BREAKING CHANGE: `DataStore.get()` now always returns `T | undefined` (Map-like semantics). Use `getOrSet()` to access default values from tags. This aligns DataStore behavior with standard Map semantics where `get()` is purely a lookup operation.

## 1.3.1

### Patch Changes

- 3208cfe: Improve README documentation clarity and reduce size by 19%

  **Enhanced API behavior documentation:**

  - `ctx.cleanup()`: Clarified lifecycle - runs on every invalidation (before re-resolution) and release, LIFO order
  - `ctx.data`: Clarified lifecycle - persists across invalidations, cleared on release, per-atom isolation
  - `controller(atom)` as dep: Explained key difference - receives unresolved controller vs auto-resolved value
  - `ctx.invalidate()`: Explained scheduling behavior - runs after factory completes, not interrupting
  - `ctrl.get()`: Documented stale reads during resolving state
  - `scope.flush()`: Added to API Reference (was undocumented)

  **Trimmed content:**

  - Removed duplicate Core Concepts diagram
  - Condensed Flow section
  - Condensed Extensions section
  - Consolidated Lifecycle diagrams
  - Removed rarely-used Direct Tag Methods section

## 1.3.0

### Minor Changes

- 058f955: Add `getOrSet` method to DataStore and fix generic signatures for `has`/`delete`

  **New: `getOrSet` method**

  Eliminates repetitive initialization boilerplate:

  ```typescript
  // Before (verbose)
  let cache = ctx.data.get(cacheTag);
  if (!cache) {
    cache = new Map();
    ctx.data.set(cacheTag, cache);
  }

  // After (concise)
  const cache = ctx.data.getOrSet(cacheTag, new Map());
  ```

  For tags with defaults, no second argument needed:

  ```typescript
  const countTag = tag({ label: "count", default: 0 });
  const count = ctx.data.getOrSet(countTag); // number, now stored
  ```

  **Fixed: `has`/`delete` signatures**

  Changed from non-generic to generic signatures to accept any `Tag<T, H>`:

  ```typescript
  // Before: rejected Tag<string, false> due to contravariance
  has(tag: Tag<unknown, boolean>): boolean

  // After: accepts any tag
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  ```

## 1.2.2

### Patch Changes

- 1642d0c: fix(flow): improve type inference for flows without parse

  Add explicit `parse?: undefined` to flow overloads without parse function. This ensures TypeScript correctly narrows the overload selection, allowing `ctx.input` to be properly typed when `parse` is provided.

## 1.2.1

### Patch Changes

- b524371: docs: replace ASCII diagrams with Mermaid and streamline code examples

  - Convert Core Concepts ASCII chart to Mermaid graph
  - Add Mermaid diagrams for Atoms, Flows, Controllers, Tags, Presets, and Extensions sections
  - Replace verbose code examples with concise versions where diagrams communicate the concept
  - Reduce README from ~710 lines to ~690 lines while improving visual clarity

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
