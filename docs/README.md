# Docs

These pages are the repo-first content set for pumped-fn. They are meant to render on GitHub first; a docs-site build can use the same files later.

## Spine

Scope is the differentiator: application roots and tests call `createScope({ presets, tags, extensions })`, product units declare atoms, flows, resources, tags, and extensions, and tests change behavior with presets instead of module interception. Evidence: `[README.md:8-17](../README.md#L8-L17)`, `[README.md:101-103](../README.md#L101-L103)`, `[pkg/core/lite/src/types.ts:78-83](../pkg/core/lite/src/types.ts#L78-L83)`, `[pkg/core/lite/src/scope.ts:441-456](../pkg/core/lite/src/scope.ts#L441-L456)`.

Graph is the mechanism: dependency records are classified as atoms, flows, controllers, tag executors, and resources. Evidence: `[pkg/core/lite/src/deps-graph.ts:5-12](../pkg/core/lite/src/deps-graph.ts#L5-L12)`, `[pkg/core/lite/src/deps-graph.ts:16-49](../pkg/core/lite/src/deps-graph.ts#L16-L49)`.

Extensions are the trace pipeline: `wrapResolve` wraps atom/resource resolution and `wrapExec` wraps flow/function execution. Evidence: `[pkg/core/lite/src/types.ts:500-520](../pkg/core/lite/src/types.ts#L500-L520)`, `[pkg/core/lite/src/scope.ts:948-960](../pkg/core/lite/src/scope.ts#L948-L960)`, `[pkg/core/lite/src/scope.ts:2377-2390](../pkg/core/lite/src/scope.ts#L2377-L2390)`.

Product code stays plain: scalar flow factories are normal functions returning `MaybePromise<Output>`, and streaming flow factories are async generators only when the flow streams. Evidence: `[pkg/core/lite/src/flow.ts:146-212](../pkg/core/lite/src/flow.ts#L146-L212)`, `[pkg/core/lite/src/types.ts:586-594](../pkg/core/lite/src/types.ts#L586-L594)`, `[pkg/core/lite/tests/exec-stream.test.ts:12-30](../pkg/core/lite/tests/exec-stream.test.ts#L12-L30)`.

## Mandatory Caveats

`isFault` is name-based: it checks `FlowFault` plus the flow name, not object identity. Evidence: `[pkg/core/lite/src/flow.ts:260-290](../pkg/core/lite/src/flow.ts#L260-L290)`.

Required tag deps are fail-fast during dependency resolution, before the factory gets control; current source does not validate every required tag at `createScope()` construction. Evidence: `[pkg/core/lite/src/scope.ts:1055-1068](../pkg/core/lite/src/scope.ts#L1055-L1068)`, `[pkg/core/lite/tests/scope.test.ts:1434-1465](../pkg/core/lite/tests/scope.test.ts#L1434-L1465)`.

Suspense durable replay rejects streaming flows today. Evidence: `[pkg/ext/suspense/src/index.ts:101-128](../pkg/ext/suspense/src/index.ts#L101-L128)`, `[pkg/ext/suspense/tests/streaming.test.ts:44-70](../pkg/ext/suspense/tests/streaming.test.ts#L44-L70)`.

Do not publish performance or bundle-size numbers from these pages. This content includes no numeric performance or bundle-size claim.

Scheduler NATS is lock-guarded scheduling, not an unconditional single-run guarantee. The package README limits the guarantee to completion before `lockTtlMs` and says lease expiry can become at-least-once. Evidence: `[pkg/ext/scheduler-nats/README.md:10-14](../pkg/ext/scheduler-nats/README.md#L10-L14)`, `[pkg/ext/scheduler-nats/README.md:37-55](../pkg/ext/scheduler-nats/README.md#L37-L55)`, `[pkg/ext/scheduler-nats/src/index.ts:47-60](../pkg/ext/scheduler-nats/src/index.ts#L47-L60)`, `[pkg/ext/scheduler-nats/src/index.ts:122-150](../pkg/ext/scheduler-nats/src/index.ts#L122-L150)`.

`pkg/render/*` and `pkg/sdk/claude` are sitemap hints only in this run. Do not author pages that claim maturity for them here. The README names them only as experimental packages. Evidence: `[README.md:190-192](../README.md#L190-L192)`.

## Pages

| Page | Reader Question | Pillar | Entry Arena / Query Family |
| --- | --- | --- | --- |
| [test-without-mocks](test-without-mocks.md) | How do I test TypeScript code without `vi.mock`? | Fully testable | `test without mocking modules`, `vi.mock alternative` |
| [vs-effect](vs-effect.md) | Should I use pumped-fn instead of Effect for DI and typed errors? | Readability without losing test/trace seams | First-party comparison |
| [vs-di-containers](vs-di-containers.md) | TypeScript DI without decorators: why use pumped-fn instead of a container? | Graph mechanism | DI hub, container comparison |
| [mental-model](mental-model.md) | What is the pumped-fn mental model? | Scope plus graph | All entry pages |
| [code-review-guide](code-review-guide.md) | How do I review pumped-fn code? | Testable and traceable code review | LLM/code-review guide |
| [adopt-incrementally](adopt-incrementally.md) | Can I adopt pumped-fn one route at a time in my existing server? | Readability during adoption | Incremental backend adoption |
| [observability](observability.md) | How do I get OpenTelemetry spans without editing business functions? | Fully traceable/observable | OTel, instrumentation |
| [request-context-without-als](request-context-without-als.md) | Why is AsyncLocalStorage `getStore()` undefined, and what should I use instead? | Explicit request context | ALS long-tail |

## Future Sections Not Authored Now

| Section | Status | Reason |
| --- | --- | --- |
| Playground | Not authored | Decision pending DKR-3. |
| API reference | Not authored | Should be generated or source-derived from public exports. |
| Package lane pages | Not authored | Current run is entry architecture, not a package dump. |
| Render pages | Hint only | Package exists, but no maturity claim in this run. |
| sdk-claude page | Hint only | Package exists, but no maturity claim in this run. |
