---
id: c3-4
c3-version: 3
title: Lite Devtools Library (@pumped-fn/lite-devtools)
summary: >
  Observability extension with fire-and-forget transports.
---

# Lite Devtools Library (@pumped-fn/lite-devtools)

## Overview {#c3-4-overview}

Extension-based observability for pumped-fn. Fire-and-forget, never blocks app.

## API {#c3-4-api}

```typescript
import { createDevtools, memory, broadcastChannel, consoleTransport } from '@pumped-fn/lite-devtools'

const mem = memory()
const scope = createScope({
  extensions: [createDevtools({ transports: [mem] })]
})

mem.subscribe((events) => console.log(events))
```

**Transports:**
| Transport | Use Case |
|-----------|----------|
| `memory()` | Same-process (panels, testing) |
| `broadcastChannel()` | Browser tabs |
| `consoleTransport()` | Debug logging |
| `httpTransport()` | Cross-process (standalone server) |

**Event types:** `atom:resolve`, `atom:resolved`, `flow:exec`, `flow:complete`, `error`

## Source Organization {#c3-4-source}

```
packages/lite-devtools/
├── src/
│   ├── index.ts        # Public exports
│   ├── extension.ts    # createDevtools() implementation
│   ├── types.ts        # Devtools namespace, event types
│   ├── symbols.ts      # Internal symbols
│   └── transports/
│       ├── index.ts    # Transport exports
│       ├── memory.ts   # In-memory transport with subscribe()
│       ├── broadcast.ts # BroadcastChannel transport
│       ├── console.ts  # Console/debug transport
│       └── http.ts     # HTTP POST transport
├── tests/
├── package.json
└── tsdown.config.ts
```

## Related {#c3-4-related}

- [ADR-015](../adr/adr-015-devtools-integration.md)
- [c3-2 Extension System](../c3-2-lite/README.md#c3-2-extension)
