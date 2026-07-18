# @pumped-fn/lite

## 5.0.0

### Major Changes

- 55b7d92: Remove the text-only `pumped-lite` CLI. The Lite package no longer installs a bin entry; use the package documentation directly.

- Atom lifecycle generations now own their pending factory and cleanup list. Release waits for pending
  settlement and late cleanup registration, invalidation detaches cleanup before re-entry, and listener
  failures surface only after the transition and sibling notifications finish.

## 4.0.0

### Major Changes

- Remove the ctx-aware-records primitive family from `@pumped-fn/lite`

The `traced()` and `serviceValue()` helpers (deprecated in 3.6.0), the `service()`
atom constructor, and the `ServiceMethod`/`ServiceMethods`/`ServiceValue`/`Serviced`/
`Traced`/`TracedDep` types are removed, along with their symbols
(`tracedDepSymbol`, `serviceValueSymbol`) and the `pumped/no-traced-service-value`
and `pumped/no-traced-handle-escape` lint rules.

The one-way surface is now `atom`, `resource`, `flow`, `tag`, `controller`, plus
`ctx.exec({ fn })` for instrumenting a specific or foreign call. Both removed helpers
were only loops that emitted `ctx.exec({ fn })` per record member, and they duplicated
each other.

Migration:

- Replace a `traced(atom)` dep plus `handle.member.exec(...)` calls with an adapter
  atom dep and `ctx.exec({ fn: () => client.member(args), name: "client.member", tags })`
  at each use site.
- Replace a `serviceValue` record closed over a runtime value with flows that depend on
  that value's atom/tag and act on it directly.

## 3.6.0

### Minor Changes

- a04a436: Deprecate `traced()` and `serviceValue()`. Both are only loops that emit `ctx.exec({ fn })` per record member, and they duplicate each other (foreign vs first-party records) — so they are a second and third way to do what `ctx.exec({ fn })` already does.

  The one way going forward:

  - **`flow`** for a capability that is a graph node (deps, factory, substitutable via tag).
  - **`ctx.exec({ fn })`** to instrument a specific/foreign call as a named, tag-able edge.

  Foreign integration is an adapter atom (the substitution seam) plus `ctx.exec({ fn: () => client.method(args), name: "client.method", tags })` — this handles class-instance SDKs (which `traced()` could not, since it only enumerates own-enumerable functions), keeps the boundary narrow, and preserves the receiver via ordinary method-call syntax. A record closed over a runtime value is expressed as flows that dep that value's atom/tag and act on it directly; the invoice-triage example replaced its `serviceValue` store with plain flows over the database atom.

  Both functions still work in this release; removal is planned for the next major. Migration: replace `traced(clientAtom)` deps + `client.method.exec(args)` with the client atom + `ctx.exec({ fn })`; replace a `serviceValue` record with flows.

  A new `@pumped-fn/lite-lint` rule, `pumped/no-traced-service-value` (error severity), enforces this doctrine by flagging any call to the `traced` or `serviceValue` imports outside the defining `pkg/core/lite/` package.

## 3.5.0

### Minor Changes

- 6d1765e: `traced()`: a capability record (a plain record of async functions over a foreign
  API, held in an atom) consumed through `traced(queries)` projects each member to
  a handle — `store.settleImport.exec({ params, tags })` — that routes through the
  exec pipeline as a named edge (`depKey.member`) with per-invocation attribution
  and per-call tags. Types are identity-preserving; the runtime contract is strict:
  non-function members and memberless records (class instances) reject at
  resolution. This is the transport-capability complement to port flows: business
  features stay flows, foreign-API call sites become visible, spannable graph
  edges.

  `traced()` deps are execution-position only: a resource dep would capture the
  owning boundary's context instead of the calling invocation's (misattribution),
  so it is rejected at the type level and at resolution.

  lite-lint: new `pumped/no-traced-handle-escape` — traced handles are one-depth
  exec edges; aliasing, passing, returning, spreading, or deep-chaining them loses
  execution-time attribution and is an error. `pumped/no-unattributed-await` exempts deps initialized with the lite
  `traced()` (attributed by construction) and its `resolve` exemption requires a
  lite `controller()` initializer; both exemptions are shadow-aware — local
  declarations, function/class names, binding-pattern parameters, catch bindings,
  and loop-initializer bindings that shadow the lite imports disqualify the
  exemption.

  Close must not lie: `ctx.close({ ok: true })` now rejects when a registered
  settlement callback (onClose/cleanup, including resource teardown) throws —
  the error propagates through the enclosing `exec` like any other failure. A
  failed close still swallows secondary teardown errors so the primary error is
  never masked. This makes transaction-boundary middleware sound: a failed
  commit rejects the owning execution instead of vanishing.

## 3.4.0

### Minor Changes

- 90854f7: Async-iterator consumption of the graph. `scope.changes(atom | selectHandle)` and
  `ctx.changes(...)` iterate value changes conflated to latest, with
  `{ states: true }` yielding state transitions and errors as data. Atoms whose
  value is an async iterable get `scope.resolveStream(atom)` /
  `ctx.resolveStream(atom)`: the scope drives the producer once and fans out
  per-consumer conflating views, calls `iterator.return()` on dispose, release,
  and invalidation (re-driving the new iterable into the same views), and never
  lets a slow or absent consumer block the producer. `scope.drain(atom, { take })`
  collects a view into an array. Context-bound iteration ends at `ctx.close()`;
  scope-level iteration ends at `scope.dispose()`; abandoning an iterator
  detaches only that view.

  Generator flows: a flow factory that is an async generator yields elements and
  returns a final output. `ctx.exec` drains to the output unchanged;
  `ctx.execStream` returns the yields as an `AsyncIterable` plus a `result`
  promise. The consumer pulls directly (inherent backpressure, no drops), each
  invocation is consumed once, and breaking out cancels the invocation — the
  generator's `finally` runs and `onClose` observes `{ ok: false, aborted: true }`.
  Streaming invocations are marked on the exec target for extensions; the
  suspense extension refuses to replay them until stream journaling exists.
  Flow handles gain `execStream(...)` so streaming composition is deps-declared:
  `deps.child.execStream(input)` + `yield*` + `await stream.result`.

  `bound(dep)` curries the executing invocation's context into ctx-first
  functions (or objects of them) resolved from tags, atoms, or resources —
  `deps: { model: bound(tags.required(model)) }` then `model.complete(request)`.
  ctx is a receiver, never an argument; the new lint rule
  `pumped/no-ctx-argument` enforces it.

- 444e524: Role tags and port flows. A tag can carry a flow; in deps position it projects
  to a context-bound `FlowHandle` (`tags.optional` yields handle-or-undefined,
  `tags.all` an array of handles), mirroring the bare-flow-dep rule. The sdk
  `Model` contract is now `Lite.Flow<ModelResponse, ModelRequest>`: implementors
  are graph nodes selected via the `model` tag, and the new `complete` port flow
  owns the `kind: "llm"` step span once for every consumer. `bound()` is removed
  from lite — value-level ctx currying is replaced by graph-native composition
  (it never shipped in a published release). `@pumped-fn/sdk-claude` /
  `@pumped-fn/sdk-codex` validate harness configuration eagerly at binding.
  `@pumped-fn/sdk-test` gains `modelStub` to lift a plain responder into an
  implementor flow. lite-lint gains `pumped/no-unattributed-await` (awaited
  foreign calls must sit inside a step-tagged flow or go through a port flow)
  and the `no-ctx-argument` remedy now points at port flows.

  Also fixes lost controller writes: `set`/`update` on a resolved atom now apply
  immediately even while an invalidation chain is active (previously they were
  deferred into a single pending slot — concurrent `update` callbacks were
  silently dropped and capture-inside-updater read stale state whenever a
  `watch: true` derived atom was subscribed). Updates queued during `resolving`
  now compose instead of overwriting.

### Patch Changes

- 36f24e2: exec() starts a flow's factory synchronously again when parsing is synchronous
  or absent — an internal refactor had deferred invocation start by a microtask,
  which let execution contexts close between a UI dispatch and the factory
  starting (silent drop under React provider re-renders). Regression tests pin
  the sync-start contract.

## 3.3.0

### Minor Changes

- 80e17f0: The pumped meta-framework and typed faults.

  `@pumped-fn/pumped` (new): vite-based scope compiler — discovery dirs
  (server/, cli/, jobs/, agents/, workflows/) assemble one lite scope via a
  generated virtual manifest, driven per run mode (dev with module-runner HMR,
  build to per-target bundles, tests bypass the framework entirely). Includes
  `mapError` edge seam, jobRun/workflowRun tags, croner-backed jobs runner.

  `@pumped-fn/lite`: `Flow<Output, Input, Fault>` with `faults: typed<F>()`,
  `ctx.fail(fault)` throwing `FlowFault`, `isFault` guard and
  `Lite.Utils.FaultsOf`. Backward compatible — fault param defaults to never.

  Extensions: observable/logging error events carry the `FlowFault` payload
  (`fault` field) so planned failures are structurally distinguishable.

  `@pumped-fn/lite-lint`: graph-coverage rule family — no-implicit-tag-read,
  no-naked-globals, no-module-state, prefer-destructured-deps,
  no-untyped-throw, no-swallowed-error — plus per-rule severity config and
  --max-warnings.

  `@pumped-fn/sdk*`: renamed from `@pumped-fn/agent-sdk*` — the generic
  runtime-primitive toolkit counterpart to pumped; agents/models are one
  primitive family. API unchanged.

## 3.2.0

### Minor Changes

- Add lazy flow composition handles for flow deps and `controller(flow, defaults)`.

## 3.1.0

### Minor Changes

- Add tag-family value equality with `tag.eq()` and `tag.same()`, and use it for managed `ExecutionContextProvider` reuse so recreated object tag values can preserve current-owned scoped state when they are fully substitutable.

### Patch Changes

- 6c8ad07: docs: every code example in README, PATTERNS, MIGRATION, CLI reference, and TSDoc is now CI-verified — typechecked strict against src, with self-contained blocks executed; two missing imports fixed in CLI reference examples
- f8bb7b4: Fix `Lite.Utils.FlowOutput` returning `never` for every flow under strictFunctionTypes (contravariant input slot; now infers against `Flow<infer O, any>`). Correct false `Controller.set`/`update` TSDoc (they never ran cleanups or emitted `resolving`). Docs audit fixes across README, PATTERNS, MIGRATION, CLI reference, and TSDoc: transaction middleware rewritten as the resource idiom (no tx in `ctx.data`), React hydration scope memoized, request-lifecycle try/finally + `rawInput`, three crashing MIGRATION examples repaired, GC/`keepAlive` guidance added, controller/select resolve preconditions documented, parse-channel and shallow-equality semantics corrected.
- f8bb7b4: docs: adopt no-suffix naming for example definitions across README, PATTERNS, MIGRATION, CLI reference, and TSDoc (`db`/`process`/`tx`/`locale` instead of `dbAtom`/`processFlow`/`txResource`/`localeTag`); fix CLI atom-cleanup example using `ctx.onClose` where atom factories only have `ctx.cleanup`

## 3.0.1

### Patch Changes

- 0ea97f9: Fix listener dispatch using stale snapshots: replacing listeners between dispatches at equal count (unsubscribe N + resubscribe N) kept notifying the removed listeners and never the new ones — React `useSelect` consumers with inline selectors froze permanently after the first update. Dispatch now snapshots per notification.

  `scope.select()` handles now register their controller subscription lazily on first `subscribe()` instead of at construction, so handles created during a React render that gets discarded (StrictMode, Suspense replays) no longer leak subscriptions. `get()` stays fresh before the first subscription and frozen after dispose, matching the existing contract.

  Invalidation scheduling uses O(1) queue membership instead of a linear scan.

## 3.0.0

### Major Changes

- b366df0: Add tag-first agent workflow helpers and tighten context tag handling across lite primitives.

  Move serializability policy out of lite core, remove the experimental primitive `use` surface, make `workflowRun()` a composable workflow tag, expose workflow and agent runtime contracts as required tags, and split workflow replay/logging from agent remote routing.

  Preserve exec extension async error semantics, make the lite CLI bin install-safe before build, and suppress the lite-hmr CJS import.meta build warning.

  Upgrade the repo build/test toolchain for the Vite 8 ecosystem, remove the stale docs site generation path, and refresh affected package build metadata.

  Remove the unmaintained `@pumped-fn/lite-devtools-server` package.

  Breaking extension note: `wrapExec` now wraps dependency resolution as well as factories so extensions can install tags before deps resolve. `ResolveEvent` now carries atom resolve context and resource context shapes explicitly.

## 2.2.0

### Minor Changes

- 5db82f9: Extract shared tracking primitives and add reactive collections.

  `@pumped-fn/lite` now exports `registerInTracker`, `startArrayTracking`, `stopArrayTracking`, `startTracking`, `stopTracking` from a new `tracker` module — allowing external renderers and benchmark adapters to share the same dep-tracking singleton.

  `@pumped-fn/lite-ui` gains:

  - `atoms<T>()` — reactive collection with item-level granularity (O(1) updates, stable `ItemSignal<T>` refs per key)
  - `$` atom binding primitives and `bind` utilities
  - `useScope()` / scope-context stack — tree-scoped reactive scope without global state
  - Performance: sync fast-path for cached-deps resolution, pre-classified vnode prop dispatch, deps-graph static pre-classification

- d2fb81f: Add execution-scoped resource resolution and React resource/scoped-value primitives.

  `@pumped-fn/lite` now exposes `ExecutionContext.resolve(atom | resource)`, `ctx.release(resource)`, resource controllers through `ctx.controller(resource)` and `controller(resource)`, resource presets, resource metadata tags, and resource-local cleanup through `ResourceContext.cleanup`.

  `@pumped-fn/lite-react` now exposes `ExecutionContextProvider`, `useExecutionContext`, `useResource`, `scopedValue`, and `useScopedValue`, including Suspense and non-Suspense load-union modes.

  `@pumped-fn/lite-devtools-server` now emits portable TUI component declaration types during release builds.

## 2.1.6

### Patch Changes

- 593e023: Performance optimizations from autoresearch sessions:

  - **lite**: Cache listener snapshots via `WeakMap<Set, snap>` (rebuild only when set size changes), cache controller entry references (`Controller._entryCache`) to skip repeated `scope.cache.get(atom)` lookups on hot paths, and add a sync fast-path for `ctrl.set` / `ctrl.update` that applies mutations synchronously when the invalidation queue is empty.
  - **lite-react**: Drop `useMemo` wrapper around `useController` (idempotent), add Suspense fast-path in `useAtom` for resolved atoms that bypasses `useSyncExternalStore`, and hoist `eq ?? Object.is` per render.

- d2fb81f: Tighten lite controller and dependency contracts, restore extension-safe scope initialization, and align the lite-react branch changes with the verified React test runtime.

## 2.1.5

### Patch Changes

- **@pumped-fn/lite** — Expand CLI corpus for LLM comprehension

  - New `mental-model` category: atom/flow/resource lifetimes, scope vs context, key invariant
  - New `tanstack-start` category: singleton scope, per-request execContext middleware, tag-seeding, client hydration
  - `primitives`: add `resource()`, clarify ResolveContext vs ExecutionContext factory types
  - `context`: split two context types with full API surfaces
  - `reactivity`: disambiguate `controller()` dep marker vs `scope.controller()`, document `watch:true`
  - `tags`: add 6-level resolution hierarchy (exec > flow > context > data > scope > default)

  **@pumped-fn/lite-react** — Test consolidation and coverage improvements

  - 50 → 37 tests (-26%) with coverage increase: 90.5% → 97.3% stmt, 81.6% → 94.3% branch
  - Add useSelect non-suspense coverage tests (auto-resolve, failed, refresh error)
  - Import from barrel file, exclude uninstrumentable index.ts from coverage config

  **@pumped-fn/lite-hmr** — Widen vite peer dependency to `^5 || ^6 || ^7 || ^8`

  **All packages** — Upgrade vitest 4.0.18 → 4.1.0, pin vite 6.x in catalog

- 10ec5a7: **@pumped-fn/lite-react** — Harden for modern React (RSC, Compiler, useSelect non-suspense)

  - Add `'use client'` directive for RSC/Next.js App Router compatibility
  - `useController({ resolve: true })` retries once on failed atoms before throwing to ErrorBoundary
  - `useSelect` gains `{ suspense: false }` mode returning `UseSelectState<S>` with data/loading/error
  - Selector errors in non-suspense `useSelect` now surface in the `error` field
  - React Compiler-safe: selector/eq via plain closures, useRef caches in getSnapshot only
  - `UseSelectOptions<S>` split into discriminated union for sound overload resolution
  - New exports: `UseSelectSuspenseOptions`, `UseSelectManualOptions`, `UseSelectOptions`, `UseSelectState`

  **@pumped-fn/lite** — `release()` now notifies listeners before cache deletion (fixes hanging promises)

- 73d426b: Significant performance improvements to scope internals — no API changes.

  **Resolve path**

  - Non-async `resolve()` with cached Promise for resolved atoms (+56% cache hits)
  - Sync fast-path in `resolveDeps` for already-resolved atom and controller deps
  - Skip extension closure chain when scope has zero extensions (+111% flow execution)

  **Invalidation & reactivity**

  - Optimized `doInvalidateSequential` set fast-path (+57% listener dispatch, +75% select)
  - Simplified invalidation chain scheduling (lighter microtask setup)
  - Eliminated redundant Map.get calls in listener subscribe/unsubscribe (+63% churn)

  **Execution context**

  - Non-async `close()` when no cleanups registered
  - Skip `ContextDataImpl` allocation when no tags configured
  - Early return in `emitStateChange` for the common no-state-listeners case

  **Misc**

  - Pass entry directly to notification methods (avoid cache lookups)
  - Simplified `controller.get()` branching
  - `for-in` over `Object.values` in release/GC to avoid array allocation

## 2.1.4

### Patch Changes

- 39dbe6c: Harden the `lite` type surface so runtime-invalid dependency shapes fail at compile
  time. `watch: true` controller deps now only type-check in atom dependencies,
  fake tag-like deps no longer satisfy the public overloads, and compile-only
  fixtures lock the contract against regression.

## 2.1.3

### Patch Changes

- b84f763: Fix `watch: true` default equality so structurally equal plain-object results do not trigger false cascades, while non-plain values like `Map` and symbol-keyed state still invalidate correctly.

## 2.1.2

### Patch Changes

- 8ed17e7: - Fix watch and invalidation edge cases in `@pumped-fn/lite` by aligning `select()` with `Object.is`, snapshotting select listeners during notification, making watch option typing match the runtime contract, and surfacing invalidation-chain failures from `flush()` instead of leaking them as background rejections.
  - Fix `@pumped-fn/lite-react` hook refresh behavior by keeping stale values visible during re-resolution, recomputing `useSelect` snapshots when selector or equality semantics change, tracking pending promises per controller, and suppressing non-Suspense `unhandledRejection` leaks on failed refreshes.

## 2.1.1

### Patch Changes

- 2ce41fc: Fix 16 bugs found via adversarial triage + 5 rounds of Codex review:

  **Correctness**

  - `preset(atom, undefined)` now works — uses `has()` check instead of `!== undefined`
  - `seekHas()` traverses parent chain via interface dispatch, not `instanceof`
  - Error-path `pendingSet` only reschedules value-type sets — `fn(undefined)` no longer produces garbage
  - `doInvalidateSequential` swallows resolve errors when pending operations exist
  - Resource cycle detection moved to per-execution-chain WeakMap — fixes false errors with `ctx.exec()`
  - Resource inflight check runs before circular check — sibling `ctx.exec()` no longer false-positives

  **Reactive system**

  - `set()`/`update()` pendingSet path skips cleanups — watch deps preserved since factory doesn't re-run
  - Unconditional `invalidationChain.delete()` in pendingSet fast-path — prevents self-loops
  - Copy-on-iterate on all 4 listener iteration sites — unsub during notification no longer drops siblings

  **Lifecycle**

  - `dispose()` awaits `chainPromise` before setting `disposed` — drains pending invalidation chain
  - `resolve()`, `controller()`, `createContext()` throw after dispose
  - `release()` cleans up dependents + schedules GC on freed deps

  **SelectHandle**

  - Eager subscription in constructor — tracks changes without active subscribers
  - `dispose()` method for explicit teardown
  - Re-subscribe refreshes cached value after auto-cleanup
  - Added `seekHas()` to `ContextData` interface, `dispose()` to `SelectHandle` interface

## 2.1.0

### Minor Changes

- a87362f: Add `controller({ resolve: true, watch: true, eq? })` for automatic reactive invalidation.

  When `watch: true` is set, the parent atom re-runs automatically whenever the dep resolves to a new value (equality-gated via `Object.is` or a custom `eq` function). Replaces manual `ctx.cleanup(ctx.scope.on('resolved', dep, () => ctx.invalidate()))` wiring. Watch listeners are auto-cleaned on re-resolve, release, and dispose.

## 2.0.0

### Major Changes

- e87f8c9: feat(lite): add `resource()` execution-scoped dependency primitive

  BREAKING CHANGE: `wrapResolve` extension hook signature changed from `(next, atom, scope)` to `(next, event: ResolveEvent)` where `ResolveEvent` is a discriminated union (`{ kind: "atom" }` or `{ kind: "resource" }`).

  New `resource({ deps, factory })` primitive for execution-level dependencies (logger, transaction, trace span). Resources are resolved fresh per execution chain, shared via seek-up within nested execs, and cleaned up with `ctx.onClose()`.

  Migration: update `wrapResolve(next, atom, scope)` → `wrapResolve(next, event)`, dispatch on `event.kind`.

## 1.11.4

### Patch Changes

- a3ae2b7: Replace text glossary with mermaid sequence diagrams in documentation

  - README.md now uses visual diagrams for composition, atom lifecycle, tag resolution, type utilities, and API surface
  - PATTERNS.md converted all usage patterns to sequence diagrams for clarity

## 1.11.3

### Patch Changes

- eda1154: Extend preset() to support Flow in addition to Atom

  - `preset(flow, fn)` - replacement function bypasses deps resolution (mock scenario)
  - `preset(flow, otherFlow)` - delegates parse/deps/factory entirely to replacement
  - Self-preset throws at creation time
  - Extensions wrap both preset variants

## 1.11.2

### Patch Changes

- 3c4ca2a: fix(lite): use `any` for TagExecutor in Dependency type to fix contravariance issue

  The Tag interface has a callable signature `(value: T): Tagged<T>` which makes it contravariant in T. This prevented `TagExecutor<SpecificType>` from being assignable to `TagExecutor<unknown>` in service/atom deps. Changed to `TagExecutor<any>` to bypass variance checking.

## 1.11.1

### Patch Changes

- 6af3cd0: Improve type ergonomics for tags and Tag.get()

  - Change `Tagged<unknown>[]` to `Tagged<any>[]` at input boundaries to eliminate user casting
  - Simplify `Tag.get()` return type from redundant `HasDefault extends true ? T : T` to plain `T`
  - Applies to: `atom()`, `flow()`, `service()`, `createScope()`, `TagSource`

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
