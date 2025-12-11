# @pumped-fn/lite-devtools

Observability extension for `@pumped-fn/lite` with fire-and-forget transport-based event streaming.

**Zero dependencies** · **Fire-and-forget** · **Multiple transports**

## How It Works

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Extension as createDevtools()
    participant Queue as Event Queue
    participant Transport

    App->>Scope: createScope({ extensions: [createDevtools(...)] })

    App->>Scope: scope.resolve(atom)
    Scope->>Extension: wrapResolve()
    Extension->>Queue: atom:resolve event
    Note over Queue: Batched, non-blocking
    Queue-->>Transport: send(events[])
    Extension-->>Scope: value
    Extension->>Queue: atom:resolved event

    App->>Scope: ctx.exec({ flow })
    Scope->>Extension: wrapExec()
    Extension->>Queue: flow:exec event
    Extension-->>Scope: result
    Extension->>Queue: flow:complete event
```

## Transport Architecture

```mermaid
graph LR
    subgraph "Application"
        Ext[createDevtools]
        Queue[Event Queue]
    end

    subgraph "Transports"
        Mem[memory]
        BC[broadcastChannel]
        Con[consoleTransport]
        HTTP[httpTransport]
    end

    subgraph "Consumers"
        Panel[Devtools Panel]
        Server[Devtools Server]
        Debug[Console]
    end

    Ext --> Queue
    Queue --> Mem
    Queue --> BC
    Queue --> Con
    Queue --> HTTP

    Mem --> Panel
    BC --> Panel
    Con --> Debug
    HTTP --> Server
```

## Transports

| Transport | Use Case | Target |
|-----------|----------|--------|
| `memory()` | Same-process consumers (panels, testing) | In-memory subscribers |
| `broadcastChannel(name?)` | Cross-tab communication | Browser tabs |
| `consoleTransport()` | Debug logging | Console output |
| `httpTransport({ url })` | Cross-process streaming | HTTP endpoint |

## Event Types

| Event | Trigger |
|-------|---------|
| `atom:resolve` | Before atom factory runs |
| `atom:resolved` | After atom factory completes |
| `flow:exec` | Before flow factory runs |
| `flow:complete` | After flow factory completes |
| `error` | On factory error |

## Full API

See [`dist/index.d.mts`](./dist/index.d.mts) for complete type definitions.

All types available under the `Devtools` namespace:

```typescript
import type { Devtools } from '@pumped-fn/lite-devtools'
```

## License

MIT
