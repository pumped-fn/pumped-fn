# @pumped-fn/lite-extension-observable-otel

OpenTelemetry sink adapter for `@pumped-fn/lite-extension-observable`.

The observable extension stays backend-neutral. This package is the optional OTEL bridge: create a
sink, inject it with `observable.runtime(...)`, and let the application own its OpenTelemetry SDK,
exporter, and collector setup.

```ts
import { createScope } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"

const sink = otel.sink()

const scope = createScope({
  extensions: [observable.extension()],
  tags: [observable.runtime({ sinks: [sink] })],
})
```

`otel.sink(...)` accepts a custom tracer, span names, and extra attributes. It keeps pending spans
only between `start` and terminal events, and `close()` ends any remaining spans before clearing
state.

## Backend Compatibility

This package targets standard OpenTelemetry APIs and OTLP pipeline setup. Backend selection belongs
to application or Collector configuration, so one sink can support Grafana, Victoria, and Jaeger
deployments without backend-specific packages.

The usual production shape is:

```txt
observable.runtime -> otel.sink -> OpenTelemetry SDK -> OTLP exporter -> Collector or OTLP backend
```

Use the same `otel.sink()` in application code, then configure the OpenTelemetry SDK or Collector
for the backend endpoint. Grafana Tempo, VictoriaTraces, and Jaeger are compatible examples when
their OTLP receiver or Collector export path is enabled.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
