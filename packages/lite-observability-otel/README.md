# @pumped-fn/lite-observability-otel

OpenTelemetry sink adapter for `@pumped-fn/lite-observability`.

The observability extension stays backend-neutral. This package is the optional OTEL bridge: create a
sink, inject it with `observability.runtime(...)`, and let the application own its OpenTelemetry SDK,
exporter, and collector setup.

## Migration to 1.0.0

Replace `@pumped-fn/lite-extension-observable-otel` with `@pumped-fn/lite-observability-otel` in the install command and imports. The sink API keeps the same role, and the namespace is now `otel` beside `observability`.

```ts
import { createScope } from "@pumped-fn/lite"
import { observability } from "@pumped-fn/lite-observability"
import { otel } from "@pumped-fn/lite-observability-otel"

const sink = otel.sink()

const scope = createScope({
  extensions: [observability.extension()],
  tags: observability.runtime({ sinks: [sink] }),
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
observability.runtime -> otel.sink -> OpenTelemetry SDK -> OTLP exporter -> Collector or OTLP backend
```

Use the same `otel.sink()` in application code, then configure the OpenTelemetry SDK or Collector
for the backend endpoint. Grafana Tempo, VictoriaTraces, and Jaeger are compatible examples when
their OTLP receiver or Collector export path is enabled.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
