# Pumped-fn Idiom Register (DKR-1)

run: pumped-fn-skill-20260710 / worker dkr-1
Sources probed (all paths repo-relative to /home/lagz0ne/dev/pumped-fn):
- examples/invoice-triage/{src,bin,tests}/** (all files), vitest.config.ts, package.json
- pkg/core/lite/PATTERNS.md, pkg/core/lite/README.md, pkg/core/lite/src/index.ts (export surface)
- docs/mental-model.md, test-without-mocks.md, code-review-guide.md, observability.md, request-context-without-als.md, adopt-incrementally.md, vs-di-containers.md + vs-effect.md (headings)
- pkg/tool/lint/src/index.ts (RuleId union L6-29, severity defaults L79-85), pkg/tool/lint/README.md (rule table L23-45)
- root CLAUDE.md (Prime Rationale, Code Style, Testing Rule)

NOTE: assignment said `pkg/core/PATTERNS.md`; actual path is `pkg/core/lite/PATTERNS.md`.

---

## 1. Primitive decision table

| Primitive | What it is | Pick it when (over neighbors) | Canonical invoice-triage usage | Failure mode of picking wrong |
|---|---|---|---|---|
| `atom()` | Scope-owned, cached graph node: transports, capabilities, state, derived data | Value lives as long as the scope; identity matters; needs cleanup at dispose. Over flow: no per-call input. Over resource: outlives any one execution | `database` transport atom with `ctx.cleanup(() => pool.end())` (src/database.ts:18-28); `intakeLines` wrapping stdin (src/adapters/stdin.ts:4-10); keepAlive signal atoms `queueSignal`/`stopping`/`outstanding` (src/ports.ts:31-54); derived `drained` via watch-controllers (src/ports.ts:56-62) | State-as-flow re-does work per call; transport-as-module-singleton kills the preset seam (lint: no-module-state, no-naked-globals) |
| `flow()` | Execution work with optional typed/parsed input, run via `ctx.exec` | Per-invocation work at or below a boundary; needs input, tracing edge, or substitution. Over atom: has input/side-effect per call. Over plain function: must be a visible, presettable, traceable edge | `classify` typed input + child flow dep (src/flows.ts:56-65); every store op is a flow (src/store.ts:39-196) | Business logic in plain exported functions taking `scope`/`ctx` = invisible untestable edge (lint: no-scope-argument, no-ctx-argument) |
| generator flow | Flow whose async-generator factory yields progress and returns a final output; same flow serves `exec` (drain) and `execStream` (consume) | Caller may want progress or streaming; abandonment must cancel cleanly | `triage` yields TriageProgress, returns Classification (src/flows.ts:67-82); `importBatch` composes child streams with `yield* stream` then `stream.result` (src/flows.ts:84-110) | Returning an async iterable from a non-generator flow fails execution (README.md ~L420); hand-rolled callbacks lose abort semantics (`{ ok: false, aborted: true }`) |
| `resource()` | Execution-context-owned value: tx, request logger, draft, action buffer. `ownership: "boundary"` (whole request) vs `"current"` (private pocket) | Value must die with the execution context and react to close result (`onClose(result => result.ok ? commit : rollback)`) | NOT used in invoice-triage (coverage risk, sec.3). Canonical form: PATTERNS.md L184-226, README.md L191-231 | Tx-as-atom leaks across requests; tx-in-ctx.data invisible to graph; commit/rollback not tied to close result |
| `tag()` | Typed ambient value: config, request facts, role selection. Optional `default`, optional `eq` | Value is contextual/configurable, not computed; supplied at scope/context creation, consumed via `tags.required/optional/all` in deps | `clock` with default (src/ports.ts:12-15), `reminderWindowDays`/`reminderRecipient` (src/ports.ts:17-25), `requestId` per request (bin/server.ts:40), `databaseUrl` (src/database.ts:13-16) | `new Date()`/`process.env` inline = hidden edge (lint: no-naked-globals); `ctx.data.seekTag` without declared dep = implicit read (lint: no-implicit-tag-read) |
| port flow (tag carrying a flow) | A tag whose value is a flow; arrives in deps as a context-bound FlowHandle. Composition root picks the implementor | Multiple implementations of a capability; the root/test decides which fills the port | `notifier` tag over `Notifier` interface (src/notifier.ts:17), bound to `consoleNotifier()` at roots (bin/server.ts:33) and `collecting(messages)` in tests; `heuristic: Model = flow(...)` fills the sdk `model` port (src/ports.ts:64-77, bin/server.ts:32) | Facade objects / if-else on env for implementation choice; module mocking the implementation (AG: no-single seam) |
| `controller(target, opts)` | For atoms/resources: reactive handle dep (`resolve`, `watch`, `eq`); for flows: preconfigured child-flow handle (`name`, `tags`, `key`) — never mix option sets | Child-flow composition (`controller(childFlow)` in deps); intentional state update (`ctrl.update`); derived invalidation (`watch: true` in atom deps) | Child flows: `deps: { classify: controller(classify) }` (src/flows.ts:70); state: `controller(outstanding, { resolve: true })` + `.update()` (src/flows.ts:115-134); derived: `drained` (src/ports.ts:56-62) | Hidden same-file `ctx.exec({ flow })` = invisible edge (lint: no-direct-flow-composition); manual subscribe wiring instead of `watch: true` |
| `extension` | Wraps `wrapResolve`/`wrapExec` around every node/edge: logging, tracing, tx policy, auth | Cross-cutting concern that must observe edges without editing business functions | `observable.extension()` + `logging.extension()` at every root (bin/server.ts:16-35, bin/cli.ts:29-48, bin/daemon.ts:13-32); inline test extension recording closes (tests/invoice-triage.test.ts:420-432) | Logging/span calls sprinkled inside factories; per-flow decorators |
| scheduler | Extension providing `scheduler.schedule({ name, cadence, overlap, catchUp, flow, input })`; backend supplied as a tag | Cron/recurring execution of a flow | `dailyReportJob`/`sendRemindersJob` (src/flows.ts:308-324); `scheduler.backend(scheduler.inProcess())` tag at roots; `ManualBackend` in tests for deterministic ticks (tests:296-329, 1058-1084) | setInterval in a factory (lint: no-naked-globals); untestable time-based sleeps in tests |
| `createScope({ presets, tags, extensions, gc })` / `preset(target, value)` | The single composition + test seam. Presets swap atoms/flows/resources; tags supply ambient values; extensions observe | Only at composition roots and tests — never a shared factory, never passed into product code | Roots: bin/server.ts:16-35, bin/cli.ts:29-48 (each use site builds its own), bin/daemon.ts:13-32; tests: `preset(database, await pgliteDatabase())` everywhere (tests:344, 393, ...) | Shared scope factory (lint: no-shared-scope-factory); helper accepting scope (lint: no-scope-argument); factory reaching ctx.scope (lint: no-scope-reach) |
| `ctx.exec({ fn, name, tags })` | Named, tag-able edge for one foreign call on an adapter-held client | Foreign SDK call that is not itself a graph node; one span per call | `ctx.exec({ fn: () => notifier.send(message), name: "notifier.send", tags: [step(...)] })` (src/flows.ts:261) | Awaited foreign call outside a span (lint: no-unattributed-await) |
| `scope.changes` / `ctx.changes` / `resolveStream` / `drain` / `execStream` | Async-iterator consumption: `changes` = conflated state wakeups; `resolveStream` = fan-out view of iterable atom; `drain` = collect; `execStream` = generator-flow yields | `changes` for wake-on-state loops; `resolveStream` for iterable atoms; `execStream` for flow progress | Wakeup loops `for await (const _ of ctx.changes(queueSignal))` (src/flows.ts:123, 148, 184); execStream progress + `.result` (tests:361-387); resolveStream fan-out + drain (tests:482-518) | Conflated stream as sole carrier of must-not-drop work loses elements — put work in state, signal via changes (README.md ~L376; the whole ingest queue design) |

## 2. Idiom register

Prime Rationale trace key: **T** = fully traceable (no implicits, effects as visible graph edges), **S** = fully testable through the scope seam, **C** = no uncontrolled side effects.

### (a) Design / graph-shape idioms

- **I-1** Layer transport → capability → feature: raw ambient IO only in transport atoms or composition-root adapters; features depend on capabilities. Why: C,T. Evidence: pkg/core/lite/README.md L69-78; src/database.ts, src/adapters/stdin.ts. Lint: `pumped/no-ambient-io-outside-boundary`, `pumped/no-naked-globals`.
- **I-2** Composition roots (and tests) are the only owners of `createScope`/`createContext`; product helpers never accept `scope` or `ctx`, factories never reach `ctx.scope`. Why: S. Evidence: bin/server.ts:16-49, docs/adopt-incrementally.md L150-154. Lint: `no-scope-argument`, `no-ctx-argument`, `no-scope-reach`, `no-shared-scope-factory`.
- **I-3** Child flows are deps via `controller(childFlow)`, never hidden same-file `ctx.exec({ flow })`; the edge must be visible and presettable. Why: T,S. Evidence: src/flows.ts:70,88-90; PATTERNS.md L81-131. Lint: `no-direct-flow-composition`.
- **I-4** Ambient facts (clock, recipient, window, requestId, db url) are tags with `tags.required(...)` in deps; missing required tags fail loud at resolution, never silently undefined. Why: T,C. Evidence: src/ports.ts:12-29, docs/mental-model.md L74-86. Lint: `no-implicit-tag-read` (warn) for undeclared reads.
- **I-5** Multi-implementation capabilities are port flows / interface tags; the root binds the implementor (`provider(heuristic)`, `notifier(consoleNotifier())`). Why: S,T. Evidence: src/notifier.ts:17, src/ports.ts:64-77, bin/server.ts:32-33. Lint: review-only.
- **I-6** Must-not-drop work lives in state (DB table / atom), not in a stream; consumers are wake-on-signal loops (`for await ctx.changes(signal)`) that drain everything pending. Conflated wakeups lose nothing; conflated data would. Why: C. Evidence: src/flows.ts:112-137 (ingest), pkg/core/lite/README.md async-iteration note (~L376); tests "burst-no-loss" (tests:520-558), "drain-race" (560-605). Lint: review-only.
- **I-7** Signal-after-commit: bump signal atoms only after the DB transaction commits, so wakeups never observe invisible rows. Why: C. Evidence: src/store.ts:68-72; tests "commit-failure" (817-851), "wake-after-commit" (853-879). Lint: review-only.
- **I-8** Aggregate atomicity: multi-row invariants (row + audit event) live in one `db.transaction`; claim-then-insert makes settle idempotent and race-safe. Why: C. Evidence: src/store.ts:50-67, 84-116; tests "aggregate-atomicity" (781-815), "concurrent-settle" (955-975). Lint: review-only.
- **I-9** Parse at the boundary: untrusted input enters via `parse:` (zod union for wire shapes, `enqueue` src/store.ts:41 + src/types.ts:42-48); trusted internal handoffs use `typed<T>()` (zero runtime cost). Boundaries map `ParseError` to protocol errors (bin/server.ts:52). Why: C,T. Lint: review-only.
- **I-10** Graceful shutdown is graph choreography: a `stop` flow flips a stopping atom and bumps signals; long-running loops observe and return; root awaits `Promise.allSettled` of loop promises and closes ctx with honest `{ ok, error }`. Why: C. Evidence: src/flows.ts:190-202, bin/daemon.ts:38-68, bin/server.ts:96-124. Lint: review-only.
- **I-11** Derived state uses `controller(dep, { resolve: true, watch: true, eq? })` in atom deps, not manual subscription wiring. Why: T. Evidence: src/ports.ts:56-62 (`drained`); PATTERNS.md L410-427. Lint: review-only.
- **I-12** Cron/recurring work is `scheduler.schedule({...flow})` with explicit `overlap`/`catchUp` policy; the backend is a tag so tests tick manually. Why: S,C. Evidence: src/flows.ts:308-324, tests:1058-1084. Lint: review-only.

### (b) Code-style idioms

- **I-13** No type-kind suffixes on definition handles (`store`, not `storeAtom`); the type system carries the kind. Why: readability, Prime "no ceremony". Evidence: root CLAUDE.md Code Style; all of src/ports.ts. Lint: `pumped/no-definition-handle-suffix`.
- **I-14** No comments in code (TSDoc on public interfaces only); no defensive try/catch or null checks in trusted paths; no `any` except at variance boundaries. Why: Prime "no slop". Evidence: root CLAUDE.md; entire example has zero inline comments. Lint: review-only (comments), partially `no-swallowed-error` (defensive catch).
- **I-15** Destructure the deps parameter in the factory signature: `factory: (ctx, { db, clock }) => ...`. Why: readability, makes edges scannable. Evidence: every factory in src/flows.ts, src/store.ts. Lint: `pumped/prefer-destructured-deps` (warn).
- **I-16** No module-level mutable state in files defining graph units; state is atoms. Why: T,S. Evidence: signal atoms in src/ports.ts vs. lint README L41. Lint: `pumped/no-module-state` (warn).
- **I-17** Throw domain error classes carrying structured fields (kind/op/entity), not bare `new Error`; never swallow a caught error. Why: T (traces discriminate planned vs unplanned failures). Evidence: `ReminderDeliveryFailure` (tests:331-335); lint README L43-44. Lint: `pumped/no-untyped-throw` (warn), `pumped/no-swallowed-error` (warn).
- **I-18** Never spread a lite handle to retrofit tags (`{ ...sharedFlow, tags }` forks node identity and dodges presets); wrap in a thin entry flow instead. Why: S. Evidence: lint README L45. Lint: `pumped/no-handle-spread` (warn).
- **I-19** No generics ceremony (`atom<Port>`), no facade objects bundling flows, no hand-written interfaces restating inferable signatures; named types only at data-transfer boundaries (src/types.ts is exactly that). Why: Prime "no ceremony the graph already does". Evidence: root CLAUDE.md; src/types.ts holds only wire/domain types. Lint: review-only.

### (c) Testing idioms (scope-as-single-seam)

- **I-20** One seam: every test is `createScope({ presets, tags, extensions })` + public API. Inside-out = preset direct deps; outside-in = preset only edge adapters. Needing more means the design leaked. Why: S (Testing Rule, root CLAUDE.md). Evidence: docs/test-without-mocks.md; every test in tests/invoice-triage.test.ts. Lint: `pumped/no-module-mocks`, `pumped/no-test-only-branches`.
- **I-21** Substitute infrastructure with real-shaped fakes at the seam: `preset(database, await pgliteDatabase())` (real Drizzle over PGlite, same `Database` type), `clock({ now: () => fixed })`, `provider(scripted([...]))`, `notifier(collecting(messages))`, `preset(intakeLines, asyncGen)`. Why: S. Evidence: tests/support/database.ts, tests:342-359, 1094-1101. Lint: `no-module-mocks` forbids the alternative.
- **I-22** Deterministic concurrency via gates, not sleeps: promise-gated model stubs (`gated(...)` tests:91-118), manual scheduler backends (tests:296-329), `changes(...)` iterators to interleave at exact wakeups (tests:577-588). Why: S,C. Lint: review-only.
- **I-23** Test lifecycle honesty: assert close results (`{ ok: false, aborted: true }` on stream abandonment, tests:413-459), assert persisted vs pending state across scope death/recovery (tests:672-779), always `ctx.close({ ok })` + `scope.dispose()`. Why: C. Lint: review-only.
- **I-24** Assert types in tests where the API shape is the contract: `expectTypeOf(stream).toEqualTypeOf<Lite.FlowStream<...>>()` (tests:364-366). Why: T. Lint: review-only.

### (d) Extension / observability idioms

- **I-25** Observability is installed at the root, never in business code: `observable.extension()` + `logging.extension()` as extensions, sinks/levels via runtime tags (`logging.runtime({...})`, `observable.runtime({ sinks: [otel.sink()] })`). Why: T,C. Evidence: bin/server.ts:16-35, docs/observability.md. Lint: review-only.
- **I-26** Name every foreign edge: `ctx.exec({ fn, name, tags })` for one client call; `step({ workflow: true, kind })` tags on workflow flows so runs are inspectable (`inspect(runtime.log, { taskId, runId })`). Why: T. Evidence: src/flows.ts:221,247,261; src/store.ts:48; tests:376-384, 1113-1165. Lint: `pumped/no-unattributed-await`.
- **I-27** Extensions use `wrapExec`/`wrapResolve` + `ctx.onClose(result => ...)` for policy (commit/rollback, span end by outcome); a test extension is just an object literal in `extensions: []`. Why: T,S. Evidence: PATTERNS.md L47-79; inline `close-recorder` extension tests:420-432. Lint: review-only.
- **I-28** Per-request context at the boundary: middleware creates `scope.createContext({ tags: [requestId(...)] })`, stores it in framework vars, closes it with the honest result — no AsyncLocalStorage. Why: T. Evidence: bin/server.ts:39-49, docs/request-context-without-als.md. Lint: `no-react-manual-execution-context` (React analog).

### (e) Performance idioms

- **I-29** `typed<T>()` for trusted inputs = zero runtime parsing; reserve zod for actual boundaries. Why: perf without losing T. Evidence: PATTERNS.md L390-406; typed vs parse split in src/store.ts:41 vs 79. Lint: review-only.
- **I-30** Direct flow deps are lazy (binding a handle does no parsing/resolution/wrapExec); `prepare()` pre-stages an invocation for loops/fanout/retry without span cost until exec. Why: perf. Evidence: PATTERNS.md L85-153. Lint: review-only.
- **I-31** Conflation is the backpressure model: `changes`/`resolveStream` views never buffer unboundedly, slow consumers skip intermediates; generator flows are pull-driven (inherent backpressure, nothing dropped). Choose per data class (state view vs work item, see I-6). Why: C + bounded memory. Evidence: README.md async-iteration + generator-flow notes; tests:881-922 (conflated observations assert strictly-increasing unique counts). Lint: review-only.
- **I-32** `keepAlive: true` on signal/state atoms that must survive GC and subscriber churn; `scope.drain(atom, { take })` bounded — never unbounded drain of an infinite feed. Why: C. Evidence: src/ports.ts:31-54; README.md drain note (~L371). Lint: review-only.

### Machine-checked vs review-only summary

Lint-enforced (24 rules, pkg/tool/lint/src/index.ts L6-29; error by default except 7 warn-tier: no-handle-spread, no-implicit-tag-read, no-naked-globals, no-module-state, prefer-destructured-deps, no-untyped-throw, no-swallowed-error — src/index.ts L79-85). React-specific rules (no-react-use-scope, no-react-use-execution-context, no-react-local-state, no-react-manual-execution-context, no-render-outside-browser-test, no-jsdom-backend) plus no-internal-example-label are lint-only idioms with no invoice-triage exercise. Everything in rings (a) design-shape beyond edges (I-6..I-12) and all of (c) test choreography, (d) policy, (e) perf is review-only — the skill must teach judgment there, not rule recall.

## 3. Coverage risks (AG-2)

**In concept (PATTERNS/README/docs) but NOT exercised by invoice-triage** — a skill trained only on the example would miss:
1. `resource()` entirely — ownership `boundary` vs `current`, `onClose` commit/rollback tied to close result, `ctx.release` vs `ctx.close` trap. Invoice-triage does transactions via `db.transaction(...)` inside flows instead. (PATTERNS.md L173-256, README.md L179-237.)
2. Resource controllers with `watch` in resource deps (PATTERNS.md L232-256).
3. `prepare()` / `step.ready` resumable invocations and `controller(flow, { key })` (PATTERNS.md L103-131) — example only uses `.exec`/`.execStream`.
4. `tags.optional` / `tags.all` (role multiplicity) and `tag({ eq })` / `tag.same` equality — example uses only `tags.required` and `default`.
5. `select(atom, selector, { eq })` derived slices and `ctrl.set` (example uses only `update`).
6. GC options (`gc: { enabled, graceMs }`), `scope.flush()` (PATTERNS.md L446-475) — example uses only `keepAlive`.
7. React integration (`@pumped-fn/lite-react`, useFlow, observer rules) — 5 of 24 lint rules are React-only.
8. Hono adapter (`@pumped-fn/lite-hono`, docs/request-context-without-als.md) — example hand-rolls middleware instead.
9. Incremental adoption / legacy-leaf migration shapes (docs/adopt-incrementally.md L80-148).
10. `ctx.data.seekTag`/`getTag` parent-chain reads and inline `ctx.exec({ fn })` service-pattern atoms (PATTERNS.md L363-386) — example's only fn-exec is notifier.send.

**In invoice-triage but thin/absent in concept docs** — the example is the sole carrier; the skill must extract these as general patterns, not invoice facts:
1. State-backed queue + signal atoms + wake-on-changes drain loop (I-6/I-7) — README has one note; the design is example-borne.
2. Scheduler extension usage and manual-backend testing (I-12, I-22).
3. Graceful shutdown choreography via a stop flow (I-10).
4. sdk-test kit: `kit()`, `modelStub`, `workflowRun`/`inspect` step assertions (I-26 test side).
5. Zod union parsing for multi-shape wire input (src/types.ts:42-48).
6. Crash-recovery / scope-death testing across two scopes sharing one preset DB (tests:672-779).

AG-2 guidance: the skill should teach every ring-(a)-(e) idiom with a **non-invoice** micro-example, cite invoice-triage as the worked composition, and separately cover the 10 concept-only surfaces above with PATTERNS/README-derived examples. Eval tasks must sample at least: one resource-centric domain, one React-or-port-multiplicity domain, one prepare/retry domain — none answerable by pattern-matching invoice-triage.

## 4. Candidate rubric dimensions (cold-build eval)

| Dim | Grades | Register idioms | Signal of failure |
|---|---|---|---|
| R1 Primitive selection | right atom/flow/resource/tag/port/extension choice per requirement | decision table; I-1, I-5, I-11, I-12 | state-as-flow, tx-as-atom, config-as-atom, facade objects |
| R2 Graph visibility & boundary ownership | every effect is a declared edge; roots own scope/ctx | I-1..I-5, I-28 | ambient IO in factories, scope-taking helpers, hidden child exec |
| R3 Testability through the seam | tests use only createScope presets/tags/extensions; deterministic concurrency | I-20..I-24 | vi.mock, sleeps, test-only branches, internal reaches |
| R4 Lifecycle & failure honesty | close results, cleanup, abort/abandonment, shutdown, atomic commit + signal-after-commit | I-7, I-8, I-10, I-23 | signals before commit, wedged loops, lying `{ ok: true }` |
| R5 State & streaming correctness | conflation-aware design; must-not-drop work in state; bounded consumption | I-6, I-31, I-32 | work items on conflated streams, unbounded drains |
| R6 Style & lint cleanliness | 0 lint diagnostics (AG-1); no-slop rules | I-13..I-19; all 24 lint rules | suffixes, comments, module state, bare Error throws |
| R7 Observability integration | root-installed extensions, named foreign edges, step tags | I-25..I-27 | inline logging, unattributed awaits, anonymous SDK calls |
| R8 Input & error taxonomy | parse at boundary, typed internally, domain error classes, protocol mapping | I-9, I-17 | zod on trusted paths, typed on wire input, swallowed errors |

Weighting suggestion: R1+R2 are gating (wrong primitive poisons everything downstream); R6 is machine-scored via `node pkg/tool/lint/dist/cli.mjs`; R3-R5, R7-R8 need LLM/human rubric grading with evidence quotes (AG-3: no single-LLM acceptance).
