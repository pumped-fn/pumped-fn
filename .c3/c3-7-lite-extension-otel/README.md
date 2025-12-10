---
id: c3-7
c3-version: 3
title: Lite Extension OTel (@pumped-fn/lite-extension-otel)
summary: >
  OpenTelemetry integration extension providing distributed tracing, metrics,
  and W3C context propagation for pumped-fn applications.
---

# Lite Extension OTel (@pumped-fn/lite-extension-otel)

## Overview {#c3-7-overview}

Extension-based OpenTelemetry integration for `@pumped-fn/lite`. Leverages the hierarchical ExecutionContext (ADR-016) for automatic parent-child span relationships without AsyncLocalStorage.

**Features:**
- **Tracing** - Spans for atoms and flows with hierarchy
- **Metrics** - Resolution time, execution duration, error rates
- **Context Propagation** - W3C Trace Context for distributed tracing

**Design principles:**
1. User controls OTel SDK configuration (exporters, sampling)
2. No global state - uses `ctx.data` for span storage
3. Standard OTel API - works with any compatible backend

## Technology Stack {#c3-7-stack}

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.9+ |
| Runtime | Node.js 18+, Browser |
| OTel API | @opentelemetry/api ^1.0 |
| Build | tsdown (rolldown-based) |
| Test | Vitest |

## Architecture {#c3-7-architecture}

```mermaid
graph TB
    subgraph "User Setup"
        SDK["OTel SDK<br/>(TracerProvider, MeterProvider)"]
        Exporters["Exporters<br/>(Jaeger, OTLP, etc.)"]
    end

    subgraph "@pumped-fn/lite-extension-otel"
        createOtel["createOtel(options)"]
        Extension["Extension"]
        SpanMgr["Span Manager"]
        Metrics["Metrics Recorder"]
        Propagation["Context Propagation"]
    end

    subgraph "@pumped-fn/lite"
        Scope["Scope"]
        ExecCtx["ExecutionContext"]
    end

    SDK --> createOtel
    createOtel --> Extension
    Extension --> SpanMgr
    Extension --> Metrics
    Extension --> Propagation

    Scope --> Extension
    ExecCtx --> SpanMgr
    SpanMgr --> SDK
    Metrics --> SDK
    SDK --> Exporters
```

## Span Hierarchy Flow {#c3-7-hierarchy}

```mermaid
sequenceDiagram
    participant Root as Root Context
    participant Child as Child Context
    participant GC as Grandchild Context
    participant Ext as OTel Extension
    participant Tracer

    Root->>Child: ctx.exec({ flow: parent })
    Child->>Ext: wrapExec(next, parentFlow, childCtx)
    Note over Ext: childCtx.parent = root<br/>root has no span
    Ext->>Tracer: startSpan('parent', { parent: undefined })
    Ext->>Child: childCtx.data.set(SPAN_KEY, parentSpan)

    Child->>GC: ctx.exec({ flow: nested })
    GC->>Ext: wrapExec(next, nestedFlow, gcCtx)
    Note over Ext: gcCtx.parent = child<br/>child has parentSpan
    Ext->>Ext: parentSpan = gcCtx.parent.data.get(SPAN_KEY)
    Ext->>Tracer: startSpan('nested', { parent: parentSpan })
    Ext->>GC: gcCtx.data.set(SPAN_KEY, nestedSpan)

    GC-->>Ext: nested result
    Ext->>Tracer: nestedSpan.end()
    GC-->>Child: return

    Child-->>Ext: parent result
    Ext->>Tracer: parentSpan.end()
    Child-->>Root: return
```

## API {#c3-7-api}

### Basic Setup

```typescript
import { createOtel } from '@pumped-fn/lite-extension-otel'
import { createScope } from '@pumped-fn/lite'
import { trace, metrics } from '@opentelemetry/api'

const scope = createScope({
  extensions: [
    createOtel({
      tracer: trace.getTracer('my-app', '1.0.0'),
      meter: metrics.getMeter('my-app'),  // optional
    })
  ]
})
```

### With SDK Configuration

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces'
  }),
  serviceName: 'my-app'
})
sdk.start()

const scope = createScope({
  extensions: [
    createOtel({
      tracer: trace.getTracer('my-app')
    })
  ]
})
```

### Options

```typescript
interface OtelOptions {
  /** Tracer for span creation (required) */
  readonly tracer: Tracer
  /** Meter for metrics (optional) */
  readonly meter?: Meter
  /** Filter atoms to trace (default: all) */
  readonly atomFilter?: (atom: Atom<unknown>) => boolean
  /** Filter flows to trace (default: all) */
  readonly flowFilter?: (flow: Flow<unknown, unknown>) => boolean
  /** Custom span name formatter */
  readonly spanName?: (target: Atom | Flow | Function) => string
}
```

### Context Propagation

```typescript
import { extractContext, injectContext, getCurrentSpan } from '@pumped-fn/lite-extension-otel'

// HTTP server: extract incoming context
const handleRequest = flow({
  factory: async (ctx) => {
    const headers = ctx.input as Record<string, string>
    const incomingCtx = extractContext(headers)

    // Span will be child of incoming context
    return processRequest(ctx.input)
  }
})

// HTTP client: inject outgoing context
const callService = flow({
  factory: async (ctx) => {
    const headers: Record<string, string> = {}
    injectContext(ctx, headers)

    return fetch('http://other-service/api', { headers })
  }
})
```

## Metrics {#c3-7-metrics}

When `meter` is provided, the extension records:

| Metric | Type | Description |
|--------|------|-------------|
| `pumped.atom.resolution_ms` | Histogram | Time to resolve atoms |
| `pumped.flow.execution_ms` | Histogram | Time to execute flows |
| `pumped.errors` | Counter | Error count by type |

**Attributes:**
- `atom.name` / `flow.name` - Target name
- `error.type` - Exception class name (for errors)

## Source Organization {#c3-7-source}

```
packages/lite-extension-otel/
├── src/
│   ├── index.ts        # Public exports
│   ├── types.ts        # OtelOptions, namespace
│   ├── extension.ts    # createOtel() implementation
│   ├── span.ts         # Span management, SPAN_KEY
│   ├── metrics.ts      # Histogram/counter setup
│   └── propagation.ts  # extractContext, injectContext
├── tests/
│   ├── tracing.test.ts
│   ├── metrics.test.ts
│   └── propagation.test.ts
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

## Testing {#c3-7-testing}

**Test organization:**
- Unit tests with in-memory OTel exporter
- Type tests using `expectTypeOf` from Vitest

**Running tests:**
```bash
pnpm -F @pumped-fn/lite-extension-otel test
pnpm -F @pumped-fn/lite-extension-otel typecheck
```

## Related {#c3-7-related}

- [ADR-018](../adr/adr-018-otel-extension.md) - Design decision
- [ADR-016](../adr/adr-016-hierarchical-execution-context.md) - Hierarchical context enabling span hierarchy
- [c3-2 Extension System](../c3-2-lite/README.md#c3-2-extension) - Extension interface
- [c3-4 lite-devtools](../c3-4-lite-devtools/README.md) - Similar extension pattern
