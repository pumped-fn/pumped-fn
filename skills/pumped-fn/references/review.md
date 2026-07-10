# Review rubric

Trace each edge: declaration, owner, scope substitution, and close behavior. This file has two tiers. `lint:` is only a mapping to one machine rule; `preference:` is human review only.

Run lint with `pumped-lite-lint` from the `@pumped-fn/lite-lint` package.

## lint:

| Rule | Reject when |
|---|---|
| `pumped/no-ambient-io-outside-boundary` | a feature factory calls network, timer, random, or filesystem APIs |
| `pumped/no-ctx-argument` | product helper accepts `ctx` |
| `pumped/no-definition-handle-suffix` | definition is named `cacheAtom` or `sendFlow` |
| `pumped/no-direct-flow-composition` | a flow body calls `ctx.exec({ flow: child })` instead of controller dep |
| `pumped/no-handle-spread` | a handle is spread to retrofit tags/options |
| `pumped/no-implicit-tag-read` | factory reads undeclared contextual tag data |
| `pumped/no-internal-example-label` | stale internal example label appears |
| `pumped/no-jsdom-backend` | browser observer test selects jsdom backend |
| `pumped/no-module-mocks` | test uses `vi.mock`, `jest.mock`, or module spy |
| `pumped/no-module-state` | graph module closes over mutable module state |
| `pumped/no-naked-globals` | product factory reads global environment/time/filesystem directly |
| `pumped/no-render-outside-browser-test` | node test renders a browser component |
| `pumped/no-react-local-state` | React component mirrors graph state with local state |
| `pumped/no-react-manual-execution-context` | React component creates/closes execution context |
| `pumped/no-react-use-execution-context` | React feature calls `useExecutionContext` |
| `pumped/no-react-use-scope` | React feature calls `useScope` |
| `pumped/no-scope-argument` | exported product helper accepts a scope |
| `pumped/no-scope-reach` | factory reaches `ctx.scope.createContext()` |
| `pumped/no-shared-scope-factory` | shared helper preconfigures a scope |
| `pumped/no-swallowed-error` | caught failure is discarded |
| `pumped/no-test-only-branches` | production logic checks test mode |
| `pumped/no-unattributed-await` | adapter/client call is awaited outside named `ctx.exec` |
| `pumped/no-untyped-throw` | factory throws bare builtin error rather than a declared fault |
| `pumped/prefer-destructured-deps` | factory uses `deps.x` rather than destructuring |

## preference:

| Review criterion | Concrete acceptance check |
|---|---|
| Layers | Raw IO is in a transport atom; a capability mediates it; feature depends only on capability. A preset can replace the transport. |
| Root ownership | Each root/test spells out `createScope` and boundary context; no product composition helper owns either. |
| Ports | Multiple implementations arrive through a tag carrying a flow/interface; root selects implementation and test supplies a collecting one. |
| Injected capability is a tag | Reviewer checks that a foreign client/capability supplied by the composition root, deployment, or request is a tag (or port flow), never an atom; lint cannot see this. |
| Tag behavior | Required/optional/all is chosen deliberately; required absence is tested as a loud resolution failure. |
| State and wakes | Durable/state queue holds work; a signal only wakes drainers. Burst wakeups cannot lose jobs. |
| Commit ordering | Transaction commits before signal. A commit failure proves no consumer observes uncommitted work. |
| Aggregate atomicity | A multi-write invariant is one transaction; failure leaves neither partial aggregate nor audit-only record. |
| Boundary parsing | Wire input uses `parse`; internal handoff uses `typed<T>()`; boundary maps parse failure to its protocol response. |
| Shutdown | Stop flow flips state and wakes loops; root awaits them and supplies actual close outcome. |
| Derived/watch | Derived atom uses atom controller `resolve + watch`; resource watch is only a resource dep and invalidates/reacquires correctly. |
| Scheduling | Job declares cadence, overlap, catch-up; manual backend test proves one tick without a clock sleep. |
| Naming/style | No suffixes/facades/ceremony generics/inferable wiring types; only transfer contracts receive named types. |
| Fault taxonomy | Flow planned failure is declared `faults` + `ctx.fail`; adapter/library exceptional failure uses a structured named error class; neither is swallowed. |
| Test seam | Test uses scope presets/tags/extensions and public flow only; fake matches the real edge's shape. |
| Deterministic concurrency | Gates or iterator coordination establish ordering; no sleep-based assertion. |
| Lifecycle/recovery | Tests close contexts honestly, assert abort outcome, and use two scopes plus shared durable fake for recovery. |
| Type contract | Test stores one execution promise, asserts its type, then awaits that same promise. |
| Extensions | Root installs extensions; wrappers call `next()` and record close outcome; business code only names foreign edges. |
| Request boundary | Boundary creates tagged context and closes it; product nodes declare request tags rather than use ALS. |
| Prepare | A keyed `prepare` stages retry/fanout; `ready` is awaited only for staged readiness and `exec` starts work. |
| Prepare staging | Keep one `prepare()` site outside retries; each `exec()` is a full execution. |
| Streams | Conflated `changes` is a view/wakeup; generator stream is pull-driven; drain has a finite `take`. |
| Liveness/GC | Signals required across churn use `keepAlive`; GC settings are intentional and `flush` precedes pending-work assertions. |
| Resource ownership | `current` versus `boundary` matches sharing intent; commit/rollback is in `onClose`, and release is not confused with close. |
| Equality/select | Tag `eq` and `same` have distinct intent; `scope.select` equality gates notification only; controller `set` is used only on resolved atom state. |
| Whole-state replacement | Prefer `ctrl.set(wholeValue)` for replacement; this is readability, not different semantics from `update`. |
| Scheduler teardown | Await `registration.stop()` before `scope.dispose()`. |
| Observability names | Name resources and atom factory functions; after `await next()`, use `ctx.name` and `ctx.parent?.name`. |
| Contract fidelity | Each exported flow's result matches the spec's prescribed shape literally; a field name that recurs across the spec (per-pass `printed`, dispatcher `{ passes, printed }` totals) keeps ONE type everywhere — an aggregate-named field (`printed`, `count`, totals) is a number unless the spec shows elements. Diff every export's return against the spec before the final gate run. |
