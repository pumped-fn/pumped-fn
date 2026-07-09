# Docs

Start with [Test without mocking modules](test-without-mocks.md) if you want the practical seam first. Start with [Mental model](mental-model.md) if you want the whole shape before picking a guide.

These pages cover scopes, explicit request context, observability, incremental adoption, DI shape, code review, and comparison caveats.

## Pages

| Page | What it answers |
| --- | --- |
| [Test without mocking modules](test-without-mocks.md) | How do I test TypeScript code that hits DB, LLM, clock, or fetch without mocking modules? |
| [Mental model](mental-model.md) | What are scopes, dependency records, dependencies, and effects? |
| [Request context without AsyncLocalStorage](request-context-without-als.md) | Why is `AsyncLocalStorage.getStore()` undefined, and what should I use instead? |
| [OpenTelemetry spans without editing business functions](observability.md) | How do I get spans without putting instrumentation inside each function? |
| [Adopt one route at a time](adopt-incrementally.md) | Can I keep my server and move one route at a time? |
| [TypeScript DI without decorators](vs-di-containers.md) | Why use pumped-fn instead of a decorator container? |
| [pumped-fn vs Effect](vs-effect.md) | Can I get a typed DI/test seam and typed errors without adopting an Effect runtime? |
| [Code review guide](code-review-guide.md) | What should I flag in a pumped-fn PR? |

## Honest limits

- `isFault` is name-based: it checks `FlowFault` plus the flow name, not object identity ([flow.ts](../pkg/core/lite/src/flow.ts#L260-L290)).
- Required tag deps are fail-fast during dependency resolution, before the factory gets control; current source does not validate every required tag at `createScope()` construction ([scope.ts](../pkg/core/lite/src/scope.ts#L1055-L1068)).
- Suspense durable replay rejects streaming flows today ([index.ts](../pkg/ext/suspense/src/index.ts#L101-L128)).
- These docs make no performance or bundle-size claims beyond zero runtime dependencies and ~12 kB min+gzip.
- Scheduler NATS is lock-guarded scheduling, not an unconditional single-run guarantee; lease expiry can become at-least-once ([README.md](../pkg/ext/scheduler-nats/README.md#L10-L14)).
- `pkg/render/*` and `pkg/sdk/claude` are experimental and not covered here ([README.md](../README.md#L190-L192)).

## Proven in the source

- Scope seam: [README.md:8-17](../README.md#L8-L17), [README.md:101-103](../README.md#L101-L103), [pkg/core/lite/src/types.ts:78-83](../pkg/core/lite/src/types.ts#L78-L83), [pkg/core/lite/src/scope.ts:441-456](../pkg/core/lite/src/scope.ts#L441-L456).
- Dependency classification: [pkg/core/lite/src/deps-graph.ts:5-12](../pkg/core/lite/src/deps-graph.ts#L5-L12), [pkg/core/lite/src/deps-graph.ts:16-49](../pkg/core/lite/src/deps-graph.ts#L16-L49).
- Extension wrappers: [pkg/core/lite/src/types.ts:500-520](../pkg/core/lite/src/types.ts#L500-L520), [pkg/core/lite/src/scope.ts:948-960](../pkg/core/lite/src/scope.ts#L948-L960), [pkg/core/lite/src/scope.ts:2377-2390](../pkg/core/lite/src/scope.ts#L2377-L2390).
- Plain flow factories and streams: [pkg/core/lite/src/flow.ts:146-212](../pkg/core/lite/src/flow.ts#L146-L212), [pkg/core/lite/src/types.ts:586-594](../pkg/core/lite/src/types.ts#L586-L594), [pkg/core/lite/tests/exec-stream.test.ts:12-30](../pkg/core/lite/tests/exec-stream.test.ts#L12-L30).
- Required tag timing: [pkg/core/lite/tests/scope.test.ts:1434-1465](../pkg/core/lite/tests/scope.test.ts#L1434-L1465).
- Suspense streaming rejection: [pkg/ext/suspense/tests/streaming.test.ts:44-70](../pkg/ext/suspense/tests/streaming.test.ts#L44-L70).
- Scheduler NATS at-least-once boundary: [pkg/ext/scheduler-nats/README.md:37-55](../pkg/ext/scheduler-nats/README.md#L37-L55), [pkg/ext/scheduler-nats/src/index.ts:47-60](../pkg/ext/scheduler-nats/src/index.ts#L47-L60), [pkg/ext/scheduler-nats/src/index.ts:122-150](../pkg/ext/scheduler-nats/src/index.ts#L122-L150).
