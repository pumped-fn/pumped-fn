# @pumped-fn/lite-extension-otel

OpenTelemetry extension for @pumped-fn/lite with automatic tracing, metrics, and context propagation.

**Zero runtime dependencies** · **ADR-016 compliant** · **W3C Trace Context**

## Architecture Overview

```mermaid
graph TB
    subgraph "Extension Hooks"
        wrapResolve[wrapResolve<br/>Atom Resolution]
        wrapExec[wrapExec<br/>Flow Execution]
    end

    subgraph "OpenTelemetry API"
        Tracer[Tracer<br/>Span Creation]
        Meter[Meter<br/>Metrics Recording]
    end

    subgraph "Context Storage"
        CtxData[ExecutionContext.data<br/>SPAN_KEY Symbol]
    end

    wrapResolve --> Tracer
    wrapResolve --> Meter
    wrapExec --> Tracer
    wrapExec --> Meter

    Tracer --> CtxData
    wrapExec -.ctx.parent.data.-> CtxData
```

## Span Hierarchy

Parent-child span relationships are established automatically via ADR-016 hierarchical ExecutionContext without AsyncLocalStorage.

```mermaid
sequenceDiagram
    participant Root as Root Context
    participant P as Parent Flow
    participant C as Child Flow
    participant Ext as OTel Extension
    participant OTel as OpenTelemetry

    Root->>+Ext: ctx.exec(parentFlow)
    Note over Ext: ctx.parent = undefined
    Ext->>OTel: tracer.startSpan("parentFlow")
    OTel-->>Ext: parentSpan
    Ext->>Ext: ctx.data.set(SPAN_KEY, parentSpan)

    Ext->>+P: execute parentFlow
    P->>+Ext: ctx.exec(childFlow)

    Note over Ext: parentSpan = ctx.parent.data.get(SPAN_KEY)
    Ext->>OTel: tracer.startSpan("childFlow", {}, parentContext)
    OTel-->>Ext: childSpan (parent: parentSpan)
    Ext->>Ext: ctx.data.set(SPAN_KEY, childSpan)

    Ext->>+C: execute childFlow
    C-->>-Ext: result
    Ext->>OTel: childSpan.end()
    Ext-->>-P: result

    P-->>-Ext: result
    Ext->>OTel: parentSpan.end()
    Ext-->>-Root: result
```

### Concurrent Execution Isolation

```mermaid
graph TB
    subgraph "Root Context"
        direction LR
        Root[ctx.data<br/>no span]
    end

    subgraph "Concurrent Execution"
        direction LR
        subgraph "Context A"
            CtxA[ctx.data<br/>SPAN_KEY: spanA]
            FlowA[flowA execution]
        end

        subgraph "Context B"
            CtxB[ctx.data<br/>SPAN_KEY: spanB]
            FlowB[flowB execution]
        end
    end

    Root --> CtxA
    Root --> CtxB
    CtxA --> FlowA
    CtxB --> FlowB

    style CtxA fill:#e1f5ff
    style CtxB fill:#fff5e1
```

## Metrics Flow

```mermaid
graph LR
    subgraph "Atom Resolution"
        AtomStart[Start Timer]
        AtomExec[Execute Factory]
        AtomSuccess{Success?}
        AtomEnd[End Timer]
    end

    subgraph "Flow Execution"
        FlowStart[Start Timer]
        FlowExec[Execute Factory]
        FlowSuccess{Success?}
        FlowEnd[End Timer]
    end

    subgraph "Metrics Collection"
        AtomHist["pumped.atom.resolution_ms<br/>(Histogram)"]
        FlowHist["pumped.flow.execution_ms<br/>(Histogram)"]
        ErrorCtr["pumped.errors<br/>(Counter)"]
    end

    AtomStart --> AtomExec
    AtomExec --> AtomSuccess
    AtomSuccess -->|Yes| AtomEnd
    AtomSuccess -->|No| ErrorCtr
    AtomEnd --> AtomHist

    FlowStart --> FlowExec
    FlowExec --> FlowSuccess
    FlowSuccess -->|Yes| FlowEnd
    FlowSuccess -->|No| ErrorCtr
    FlowEnd --> FlowHist

    style AtomHist fill:#d4edda
    style FlowHist fill:#d4edda
    style ErrorCtr fill:#f8d7da
```

### Recorded Metrics

| Metric Name | Type | Description | Attributes |
|-------------|------|-------------|------------|
| `pumped.atom.resolution_ms` | Histogram | Time to resolve atoms | `atom.name` |
| `pumped.flow.execution_ms` | Histogram | Time to execute flows | `flow.name` |
| `pumped.errors` | Counter | Number of errors | `atom.name` or `flow.name`, `error.type` |

## Context Propagation

W3C Trace Context propagation for distributed tracing across service boundaries.

```mermaid
sequenceDiagram
    participant Incoming as Incoming Request
    participant Extract as extractContext()
    participant Flow as Flow Execution
    participant Span as Current Span
    participant Inject as injectContext()
    participant Outgoing as Outgoing Request

    Incoming->>Extract: headers: {traceparent: "00-..."}
    Extract->>Extract: propagation.extract()
    Extract-->>Flow: OTel Context

    Flow->>Span: ctx.data.get(SPAN_KEY)
    Note over Flow,Span: Continue existing trace

    Flow->>Inject: ctx, headers
    Inject->>Inject: propagation.inject()
    Inject-->>Outgoing: headers: {traceparent: "00-..."}

    Note over Incoming,Outgoing: Trace ID propagated end-to-end
```

### Propagation Flow Detail

```mermaid
graph TB
    subgraph "Service A"
        A1[Flow A executes]
        A2[getCurrentSpan ctx]
        A3["injectContext(ctx, headers)"]
    end

    subgraph "HTTP Transport"
        H1["traceparent: 00-traceId-spanId-01"]
    end

    subgraph "Service B"
        B1["extractContext(headers)"]
        B2[Create OTel Context]
        B3[Flow B executes<br/>with parent trace]
    end

    A1 --> A2
    A2 --> A3
    A3 --> H1
    H1 --> B1
    B1 --> B2
    B2 --> B3

    style H1 fill:#e8f4f8
```

## Features

| Feature | Description | Implementation |
|---------|-------------|----------------|
| **Automatic Tracing** | Spans created for all atoms/flows | `wrapResolve` + `wrapExec` hooks |
| **Hierarchical Spans** | Parent-child relationships via `ctx.parent.data` | No AsyncLocalStorage required (ADR-016) |
| **Metrics Collection** | Duration histograms and error counters | Optional Meter support |
| **Context Propagation** | W3C Trace Context extract/inject | `extractContext()` / `injectContext()` |
| **Filtering** | Selective tracing via `atomFilter` / `flowFilter` | Filter predicates in options |
| **Custom Naming** | Override span names | `spanName` option |
| **Error Recording** | Exception events and status codes | Automatic on catch |

## Extension Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: createOtel(options)
    Created --> Installed: scope.extensions

    state Installed {
        [*] --> Idle

        Idle --> AtomResolve: scope.resolve(atom)
        AtomResolve --> StartAtomSpan: wrapResolve called
        StartAtomSpan --> ExecuteAtom: tracer.startSpan()
        ExecuteAtom --> RecordMetrics: span.end()
        RecordMetrics --> Idle

        Idle --> FlowExec: ctx.exec(flow)
        FlowExec --> StartFlowSpan: wrapExec called
        StartFlowSpan --> CheckParent: Get ctx.parent.data
        CheckParent --> ExecuteFlow: tracer.startSpan(parent)
        ExecuteFlow --> RecordMetrics
    }
```

## Dependencies

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `@pumped-fn/lite` | `^1.0.0` | peer | Core framework integration |
| `@opentelemetry/api` | `^1.0.0` | peer | OpenTelemetry API types and context |

## Design Principles

1. **Zero Runtime Dependencies**: Only peer dependencies for maximum flexibility
2. **ADR-016 Compliance**: Leverages hierarchical ExecutionContext for automatic parent tracking
3. **Opt-in Metrics**: Tracing always enabled, metrics only when Meter provided
4. **Type-Safe**: Full TypeScript support via generated `.d.mts` / `.d.cts` files
5. **Extension-Based**: Clean integration via `Lite.Extension` protocol

## License

MIT
