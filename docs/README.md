# Docs

Start with [Test without mocking modules](test-without-mocks.md) when you want the practical seam first. Start with [Mental model](mental-model.md) when you want the shape of scopes, tags, resources, presets, and extensions before choosing a guide.

Each page starts with code you can read as the main idea, then explains the parts that matter for production wiring and tests.

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

- `isFault` matches a `FlowFault` plus the flow name, not object identity.
- Required tag deps fail during dependency resolution, before the unit factory runs — not at `createScope()` construction.
- Suspense durable replay rejects streaming flows today.
- Size: zero runtime dependencies, ~12 kB min+gzip. No performance benchmarks are published.
- Scheduler NATS is lock-guarded scheduling, not an unconditional single-run guarantee; lease expiry can become at-least-once.
- `pkg/render/*` and `pkg/sdk/claude` are experimental and not covered here.

## Source

- [Core README](../README.md)
- [Lite flow faults](../pkg/core/lite/src/flow.ts)
- [Lite scope](../pkg/core/lite/src/scope.ts)
- [Suspense extension](../pkg/ext/suspense/src/index.ts)
- [Scheduler NATS README](../pkg/ext/scheduler-nats/README.md)

## Next

- [Test without mocking modules](test-without-mocks.md)
- [Mental model](mental-model.md)
