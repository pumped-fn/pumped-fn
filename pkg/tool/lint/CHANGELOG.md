# @pumped-fn/lite-lint

## 0.7.0

### Minor Changes

- a04a436: Deprecate `traced()` and `serviceValue()`. Both are only loops that emit `ctx.exec({ fn })` per record member, and they duplicate each other (foreign vs first-party records) — so they are a second and third way to do what `ctx.exec({ fn })` already does.

  The one way going forward:

  - **`flow`** for a capability that is a graph node (deps, factory, substitutable via tag).
  - **`ctx.exec({ fn })`** to instrument a specific/foreign call as a named, tag-able edge.

  Foreign integration is an adapter atom (the substitution seam) plus `ctx.exec({ fn: () => client.method(args), name: "client.method", tags })` — this handles class-instance SDKs (which `traced()` could not, since it only enumerates own-enumerable functions), keeps the boundary narrow, and preserves the receiver via ordinary method-call syntax. A record closed over a runtime value is expressed as flows that dep that value's atom/tag and act on it directly; the invoice-triage example replaced its `serviceValue` store with plain flows over the database atom.

  Both functions still work in this release; removal is planned for the next major. Migration: replace `traced(clientAtom)` deps + `client.method.exec(args)` with the client atom + `ctx.exec({ fn })`; replace a `serviceValue` record with flows.

  A new `@pumped-fn/lite-lint` rule, `pumped/no-traced-service-value` (error severity), enforces this doctrine by flagging any call to the `traced` or `serviceValue` imports outside the defining `pkg/core/lite/` package.

## 0.6.0

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

## 0.5.0

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

## 0.4.0

### Minor Changes

- 1b83ce4: Scheduling as graph nodes with pluggable backends. `schedule()` returns a
  keepAlive atom bound to a `SchedulerBackend` via the backend tag; `inProcess()`
  (croner) ships in core, `nats()` provides durable distributed scheduling over
  JetStream KV (per-run-key locking with TTL takeover, catch-up skip/last/all,
  run history). pumped: jobs entries are schedule atoms (schedule tag removed),
  sibling `meta` exports for route/command, `p` alias + named exports,
  no-handle-spread lint rule.

## 0.3.0

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

## 0.2.1

### Patch Changes

- dc60cea: Add a `pumped/no-direct-flow-composition` rule that requires flow-to-flow composition to use explicit `controller(childFlow)` dependencies instead of hidden direct flow execution.

## 0.2.0

### Minor Changes

- Add `useFlow` for React feature components, update examples to dispatch flows through the hook, and add a Lightpanda browser smoke gate for the `useFlow` integration.

  Add a lite-lint rule that blocks feature components from calling `useExecutionContext` directly.

## 0.1.0

### Minor Changes

- e0cc714: Add a lint-like anti-pattern scanner for lite and lite-react boundary rules.
