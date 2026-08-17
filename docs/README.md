# Docs

Start with [Test without mocking modules](test-without-mocks.md) when you want the practical seam
first. Start with [Mental model](mental-model.md) when you want the shape of scopes, tags, resources,
presets, and extensions.

## Pages

| Page | What it answers |
| --- | --- |
| [Test without mocking modules](test-without-mocks.md) | How do I test code that reaches a database, clock, or network without mocking modules? |
| [Mental model](mental-model.md) | What do scopes, atoms, flows, resources, tags, presets, and extensions own? |
| [Request context without ambient storage](request-context-without-als.md) | How do I carry request facts without a hidden global context? |
| [OpenTelemetry spans](observability.md) | How do I add spans without editing each business function? |
| [Adopt one route at a time](adopt-incrementally.md) | Can I keep my server and move one route at a time? |
| [TypeScript DI without decorators](vs-di-containers.md) | Why use a graph seam instead of a decorator container? |
| [pumped-fn vs Effect](vs-effect.md) | When is a small scope seam a better fit than an Effect program? |
| [Code review guide](code-review-guide.md) | What should I flag in a pumped-fn change? |

## Honest limits

- `isFault` matches a `FlowFault` plus the flow name, not object identity.
- Required tag dependencies fail during resolution, before the unit factory runs. They are not all
  checked when `createScope()` is called.
- Lite is a graph and lifetime runtime. It does not choose your server, database, queue, logger
  destination, or telemetry backend.
- Logging and observability capture payloads only when you opt in. Keep that setting off unless the
  data has been reviewed and redacted.

## Source

- [Lite README](../packages/lite/README.md)
- [Lite patterns](../packages/lite/PATTERNS.md)
- [Lite React README](../packages/lite-react/README.md)
- [Lite Lint README](../packages/lite-lint/README.md)
- [Logging README](../packages/lite-logging/README.md)
- [Observability README](../packages/lite-observability/README.md)

## Next

- [Test without mocking modules](test-without-mocks.md)
- [Mental model](mental-model.md)
