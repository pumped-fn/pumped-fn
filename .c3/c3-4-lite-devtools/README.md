---
id: c3-4
c3-version: 4
title: Lite Devtools Library (@pumped-fn/lite-devtools)
type: container
boundary: library
parent: c3-0
goal: Stream lite runtime events to external observers through fire-and-forget transports.
summary: >
  Observability extension with fire-and-forget transports.
---

# Lite Devtools Library (@pumped-fn/lite-devtools)

## Goal

Instrument lite scopes and executions so applications can observe runtime behavior without blocking production work.

## Overview {#c3-4-overview}

Extension-based observability for pumped-fn. Fire-and-forget, never blocks app.

## Responsibilities

- Capture runtime events from the lite extension surface
- Normalize and publish those events through transport adapters
- Preserve low-overhead, fire-and-forget observability semantics

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

## Components

| ID | Name | Category | Status | Goal Contribution |
|----|------|----------|--------|-------------------|
| c3-401 | Extension Runtime | foundation | active | Captures lite resolve and exec activity, normalizes it into events, and batches it for delivery. |
| c3-402 | Transport Adapters | foundation | active | Delivers event batches to in-process, browser, console, and HTTP observers without blocking app work. |

## Related {#c3-4-related}

- [ADR-015](../adr/adr-015-devtools-integration.md)
- [c3-2 Extension System](../c3-2-lite/README.md#c3-2-extension)
