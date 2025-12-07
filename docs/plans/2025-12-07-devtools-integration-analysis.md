# Devtools Integration Analysis

**Date:** 2025-12-07
**Status:** Draft

## Overview

Analysis of devtools integration options for pumped-fn, leveraging the existing exposed APIs.

## Current Integration Points

```mermaid
graph TB
    subgraph "External Devtools"
        DT[Devtools UI]
        BEXT[Browser Extension]
        DASH[Dashboard]
    end

    subgraph "Integration Layer"
        EXT["Extension System<br/>(Primary Hook)"]
        MSG[Message Bridge]
    end

    subgraph "pumped-fn Core"
        SCOPE[Scope]
        ATOM[Atom Resolution]
        FLOW[Flow Execution]
        CTRL[Controller]
        TAG[Tag System]
    end

    subgraph "Extension Hooks"
        INIT["init(scope)"]
        WRAP_R["wrapResolve(next, atom, scope)"]
        WRAP_E["wrapExec(next, target, ctx)"]
        DISPOSE["dispose(scope)"]
    end

    subgraph "Observable APIs"
        CTRL_ON["ctrl.on(event, listener)"]
        SCOPE_ON["scope.on(state, atom, listener)"]
        SELECT["scope.select(atom, selector)"]
    end

    DT --> MSG
    BEXT --> MSG
    DASH --> MSG
    MSG --> EXT

    EXT --> INIT
    EXT --> WRAP_R
    EXT --> WRAP_E
    EXT --> DISPOSE

    SCOPE --> ATOM
    SCOPE --> FLOW
    SCOPE --> CTRL
    SCOPE --> TAG

    ATOM --> WRAP_R
    FLOW --> WRAP_E
    CTRL --> CTRL_ON
    SCOPE --> SCOPE_ON
    SCOPE --> SELECT

    style EXT fill:#f9f,stroke:#333,stroke-width:2px
    style WRAP_R fill:#bbf,stroke:#333
    style WRAP_E fill:#bbf,stroke:#333
```

## Integration Point Details

### 1. Extension System (Primary)

The extension interface is purpose-built for cross-cutting concerns:

```typescript
interface Extension {
  readonly name: string
  init?(scope: Scope): MaybePromise<void>
  wrapResolve?(next: () => Promise<unknown>, atom: Atom<unknown>, scope: Scope): Promise<unknown>
  wrapExec?(next: () => Promise<unknown>, target: Flow | Function, ctx: ExecutionContext): Promise<unknown>
  dispose?(scope: Scope): MaybePromise<void>
}
```

**Available Data:**

| Hook | Available Information |
|------|----------------------|
| `init` | Scope reference, extensions list, scope tags |
| `wrapResolve` | Atom factory, deps, tags, scope instance |
| `wrapExec` | Flow/fn reference, input, execution context, tags |
| `dispose` | Final scope state, cleanup tracking |

### 2. Controller Events

```typescript
const ctrl = scope.controller(atom)

ctrl.on('resolving', () => { /* resolution started */ })
ctrl.on('resolved', () => { /* value available via ctrl.get() */ })
ctrl.on('*', () => { /* any state change */ })

ctrl.state  // 'idle' | 'resolving' | 'resolved' | 'failed'
```

### 3. Scope Events

```typescript
scope.on('idle', atom, () => { /* atom released */ })
scope.on('resolving', atom, () => { /* resolution started */ })
scope.on('resolved', atom, () => { /* resolution complete */ })
scope.on('failed', atom, () => { /* resolution failed */ })
```

### 4. Select API

```typescript
const handle = scope.select(atom, value => value.count)
handle.subscribe(() => {
  const derived = handle.get()
})
```

## Potential Devtools Features

### Feature Matrix

| Feature | Extension | Controller | Scope Events | Future (FlowExecution) |
|---------|-----------|------------|--------------|------------------------|
| Atom Timeline | ✅ wrapResolve | ✅ on('*') | ✅ | - |
| Dependency Graph | ✅ atom.deps | - | - | - |
| Flow Tracing | ✅ wrapExec | - | - | ✅ execution.id |
| State Inspection | ✅ | ✅ ctrl.get() | - | - |
| Tag Inspection | ✅ atom.tags, ctx.input | - | - | - |
| Execution Timing | ✅ | - | - | ✅ |
| Cancellation | - | - | - | ✅ abort signal |
| Error Tracking | ✅ try/catch | - | ✅ 'failed' | ✅ status |
| Memory Profiling | ✅ dispose | ✅ release | - | ✅ auto-cleanup |

## Implementation Options

### Option A: Browser DevTools Extension

```mermaid
sequenceDiagram
    participant App
    participant Ext as DevtoolsExtension
    participant CS as Content Script
    participant Panel as DevTools Panel

    App->>Ext: createScope({ extensions: [devtools()] })
    Ext->>CS: postMessage({ type: 'SCOPE_CREATED' })
    CS->>Panel: port.postMessage()

    App->>Ext: scope.resolve(atom)
    Ext->>Ext: wrapResolve() starts
    Ext->>CS: postMessage({ type: 'RESOLVE_START', atom })
    Note over Ext: await next()
    Ext->>CS: postMessage({ type: 'RESOLVE_END', atom, value })
    CS->>Panel: Update timeline
```

**Pros:**
- Native browser integration
- Familiar UX (like React DevTools)
- Access to Chrome/Firefox DevTools APIs

**Cons:**
- Browser-specific implementation
- Complex content script messaging

### Option B: Standalone Dashboard

```mermaid
graph LR
    subgraph "Application"
        SCOPE[Scope]
        EXT[DevtoolsExtension]
        WS[WebSocket Client]
    end

    subgraph "Dashboard Server"
        SERVER[WS Server]
        DB[(Event Store)]
        API[REST API]
    end

    subgraph "Dashboard UI"
        TIMELINE[Timeline View]
        GRAPH[Dependency Graph]
        STATE[State Inspector]
    end

    SCOPE --> EXT
    EXT --> WS
    WS <--> SERVER
    SERVER --> DB
    DB --> API
    API --> TIMELINE
    API --> GRAPH
    API --> STATE
```

**Pros:**
- Framework-agnostic
- SSR/Node.js support
- Multi-app aggregation
- Persistent history

**Cons:**
- Extra infrastructure
- Latency overhead

### Option C: In-App Debug Panel (React)

```typescript
import { DevtoolsProvider, useDevtools } from '@pumped-fn/react-devtools'

function App() {
  return (
    <DevtoolsProvider>
      <ScopeProvider scope={scope}>
        <MyApp />
        <DevtoolsPanel position="bottom" /> {/* Overlay panel */}
      </ScopeProvider>
    </DevtoolsProvider>
  )
}
```

**Pros:**
- Zero config
- Immediate feedback
- Framework integration

**Cons:**
- React-only
- Bundle size impact
- Production strip needed

### Option D: CLI/Terminal Logger

```typescript
const devtools = createDevtools({
  output: 'console', // or 'file', 'stream'
  format: 'pretty', // or 'json', 'compact'
  filter: { atoms: true, flows: true, timing: true }
})

const scope = createScope({ extensions: [devtools] })
```

**Output:**
```
[12:34:56.789] ⚡ RESOLVE dbAtom
[12:34:56.792]   └─ deps: [configAtom]
[12:34:56.795] ✓ RESOLVED dbAtom (6ms)
[12:34:56.800] ▶ EXEC fetchUserFlow
[12:34:56.801]   └─ input: { id: "123" }
[12:34:56.850] ✓ EXEC fetchUserFlow (50ms)
```

**Pros:**
- Universal (Node, browser, Deno)
- Minimal overhead
- Easy CI integration

**Cons:**
- No interactive exploration
- Limited visualization

## Recommended Phased Approach

```mermaid
graph LR
    subgraph "Phase 1: Foundation"
        P1A[Core Extension]
        P1B[Event Emitter]
        P1C[CLI Logger]
    end

    subgraph "Phase 2: Visualization"
        P2A[Timeline View]
        P2B[Dependency Graph]
        P2C[React Panel]
    end

    subgraph "Phase 3: Advanced"
        P3A[Browser Extension]
        P3B[Time Travel]
        P3C[FlowExecution Integration]
    end

    P1A --> P2A
    P1B --> P2B
    P1C --> P2C
    P2A --> P3A
    P2B --> P3B
    P2C --> P3C
```

### Phase 1: Core Devtools Extension

Create `@pumped-fn/devtools` package with transport-based architecture:

```mermaid
graph TB
    subgraph "Your App Process"
        SCOPE[Scope + Extension]
        CORE[Devtools Core]
        Q[Event Queue]
    end

    subgraph "Transports (fire-and-forget)"
        BC[BroadcastChannel<br/>Browser same-origin]
        WS[WebSocket<br/>Node.js / Remote]
        PM[postMessage<br/>iframe / extension]
        MEM[Memory<br/>Same-page panel]
        FILE[File/Stream<br/>Logging]
    end

    subgraph "Clients (separate process/context)"
        TUI[TUI - Terminal 2]
        WEB[Web Dashboard]
        EXT[Browser Extension]
        PANEL[In-page Panel]
    end

    SCOPE -->|sync| CORE
    CORE -->|"queueMicrotask"| Q
    Q -->|async, non-blocking| BC
    Q -->|async, non-blocking| WS
    Q -->|async, non-blocking| PM
    Q -->|sync| MEM
    Q -->|async| FILE

    BC -.-> WEB
    BC -.-> PANEL
    WS -.-> TUI
    PM -.-> EXT
    MEM -.-> PANEL
```

#### Transport Strategy by Environment

| Environment | Transport | Why |
|-------------|-----------|-----|
| Browser (same-origin) | `BroadcastChannel` | Zero setup, native API, no server |
| Browser (extension) | `postMessage` | Cross-origin communication |
| Browser (same-page) | `Memory` | Direct reference, zero overhead |
| Node.js | `WebSocket` | Cross-process, TUI in separate terminal |
| Node.js (logging) | `File/Stream` | Persistent debug logs |

#### Core Design Principles

1. **Fire-and-forget**: Never await transport, never block app
2. **Permissive**: Silently drop if transport fails
3. **Batched**: Queue events, flush on microtask
4. **Serializable**: Events must be JSON-safe for cross-context

```typescript
interface Transport {
  readonly name: string
  send(events: DevtoolsEvent[]): void  // fire-and-forget, no return
  dispose?(): void
}

interface DevtoolsOptions {
  transports?: Transport[]
  batchMs?: number        // batch window, default 0 (microtask)
  maxQueueSize?: number   // drop oldest if exceeded, default 1000
  serialize?: (event: DevtoolsEvent) => unknown  // custom serializer
}

interface DevtoolsEvent {
  id: string
  type: 'atom:resolve' | 'atom:resolved' | 'flow:exec' | 'flow:complete' | 'error'
  timestamp: number
  name: string
  duration?: number
  deps?: string[]
  input?: unknown
  output?: unknown
  error?: { message: string, stack?: string }
}
```

#### Built-in Transports

```typescript
// Browser: BroadcastChannel (recommended for web)
function broadcastChannel(channel?: string): Transport {
  const bc = new BroadcastChannel(channel ?? 'pumped-devtools')
  return {
    name: 'broadcast-channel',
    send: (events) => {
      try { bc.postMessage(events) } catch {}  // permissive
    },
    dispose: () => bc.close()
  }
}

// Browser: postMessage (for extensions, iframes)
function postMessage(target: Window, origin?: string): Transport {
  return {
    name: 'post-message',
    send: (events) => {
      try { target.postMessage({ type: 'pumped-devtools', events }, origin ?? '*') } catch {}
    }
  }
}

// Browser/Node: Memory (same-page panel, testing)
function memory(): Transport & { subscribe: (cb: (events: DevtoolsEvent[]) => void) => () => void } {
  const listeners = new Set<(events: DevtoolsEvent[]) => void>()
  return {
    name: 'memory',
    send: (events) => listeners.forEach(cb => cb(events)),
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb) }
  }
}

// Node.js: WebSocket server (for TUI, remote dashboard)
function websocketServer(opts: { port: number }): Transport {
  const clients = new Set<WebSocket>()
  const wss = new WebSocketServer({ port: opts.port })
  wss.on('connection', (ws) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  })
  return {
    name: 'websocket',
    send: (events) => {
      const data = JSON.stringify(events)
      clients.forEach(ws => { try { ws.send(data) } catch {} })
    },
    dispose: () => wss.close()
  }
}

// Node.js: File stream (debugging, CI)
function fileStream(opts: { path: string }): Transport {
  const stream = createWriteStream(opts.path, { flags: 'a' })
  return {
    name: 'file',
    send: (events) => {
      events.forEach(e => stream.write(JSON.stringify(e) + '\n'))
    },
    dispose: () => stream.end()
  }
}
```

#### Extension Implementation

```typescript
function createDevtools(options?: DevtoolsOptions): Lite.Extension {
  const transports = options?.transports ?? []
  const maxQueue = options?.maxQueueSize ?? 1000
  let queue: DevtoolsEvent[] = []
  let scheduled = false

  function emit(event: DevtoolsEvent) {
    queue.push(event)
    if (queue.length > maxQueue) queue.shift()  // drop oldest

    if (!scheduled) {
      scheduled = true
      queueMicrotask(() => {
        const batch = queue
        queue = []
        scheduled = false
        transports.forEach(t => t.send(batch))  // fire-and-forget
      })
    }
  }

  return {
    name: 'devtools',

    wrapResolve: async (next, atom, scope) => {
      const id = crypto.randomUUID()
      const name = atom.factory.name ?? '<anonymous>'
      const deps = Object.keys(atom.deps ?? {})

      emit({ id, type: 'atom:resolve', timestamp: Date.now(), name, deps })

      const start = performance.now()
      try {
        const result = await next()
        emit({ id, type: 'atom:resolved', timestamp: Date.now(), name, deps, duration: performance.now() - start })
        return result
      } catch (err) {
        emit({ id, type: 'error', timestamp: Date.now(), name, error: { message: String(err) } })
        throw err
      }
    },

    wrapExec: async (next, target, ctx) => {
      const id = crypto.randomUUID()
      const name = 'name' in target ? (target.name ?? '<anonymous>') : target.name ?? '<fn>'

      emit({ id, type: 'flow:exec', timestamp: Date.now(), name, input: ctx.input })

      const start = performance.now()
      try {
        const result = await next()
        emit({ id, type: 'flow:complete', timestamp: Date.now(), name, duration: performance.now() - start })
        return result
      } catch (err) {
        emit({ id, type: 'error', timestamp: Date.now(), name, error: { message: String(err) } })
        throw err
      }
    },

    dispose: () => {
      transports.forEach(t => t.dispose?.())
    }
  }
}
```

#### Usage Examples

```typescript
// Browser app with in-page devtools panel
const mem = memory()
const scope = createScope({
  extensions: [devtools({ transports: [mem, broadcastChannel()] })]
})

// React panel subscribes via memory transport
mem.subscribe((events) => setEvents(prev => [...prev, ...events]))

// Node.js app with TUI in separate terminal
const scope = createScope({
  extensions: [devtools({
    transports: [
      websocketServer({ port: 9229 }),
      fileStream({ path: './debug.ndjson' })
    ]
  })]
})

// Then in another terminal:
// npx @pumped-fn/devtools-tui --port 9229
```

### Dogfooding: Devtools Built on pumped-fn

The devtools itself is built using `@pumped-fn/lite` and `@pumped-fn/react-lite`. This:
- Proves the library works at scale
- Provides consistent patterns
- Uses atoms for reactive state
- Keeps devtools scope isolated from app scope

#### Architecture Overview

```mermaid
graph TB
    subgraph "App Process"
        APP_SCOPE[App Scope]
        EXT[Devtools Extension]
        TRANSPORT[Transport]
    end

    subgraph "Devtools Scope (Isolated)"
        DT_SCOPE[createScope]

        subgraph "Source Atoms"
            EVENTS[eventsAtom<br/>DevtoolsEvent[]]
            INDEX[selectedIndexAtom<br/>number | null]
            FILTER[filterAtom<br/>EventFilter]
        end

        subgraph "Derived Atoms"
            FILTERED[filteredEventsAtom]
            SELECTED[selectedEventAtom]
            STATS[statsAtom]
        end

        subgraph "Flows"
            ADD[addEventsFlow]
            NAV[navigateFlow]
            SET_FILTER[setFilterFlow]
        end
    end

    subgraph "UI Layer"
        TUI["@opentui/react<br/>+ @pumped-fn/react-lite"]
        WEB["React DOM<br/>+ @pumped-fn/react-lite"]
    end

    APP_SCOPE --> EXT
    EXT -->|emit| TRANSPORT
    TRANSPORT -->|"subscribe → addEventsFlow"| DT_SCOPE

    EVENTS --> FILTERED
    FILTER --> FILTERED
    EVENTS --> SELECTED
    INDEX --> SELECTED
    EVENTS --> STATS

    DT_SCOPE --> TUI
    DT_SCOPE --> WEB
```

#### Complete Data Flow Sequence

```mermaid
sequenceDiagram
    participant App as App Scope
    participant Ext as DevtoolsExtension
    participant Q as Event Queue
    participant T as Transport
    participant DT as Devtools Scope
    participant Ctrl as eventsAtom Controller
    participant UI as React Component

    Note over App,UI: 1. App resolves an atom
    App->>Ext: wrapResolve(next, atom, scope)
    Ext->>Ext: emit({ type: 'atom:resolve', ... })

    Note over Ext,Q: 2. Event queued (non-blocking)
    Ext->>Q: queue.push(event)
    Ext->>Ext: queueMicrotask(flush)
    Ext-->>App: return next()

    Note over Q,T: 3. Microtask flushes batch
    Q->>T: transport.send(batch)

    Note over T,DT: 4. Transport delivers to devtools
    T->>DT: subscribe callback
    DT->>DT: createContext()
    DT->>DT: ctx.exec({ flow: addEventsFlow, input: { events } })

    Note over DT,Ctrl: 5. Flow updates atom via controller
    DT->>Ctrl: scope.controller(eventsAtom)
    Ctrl->>Ctrl: ctrl.update(prev => [...prev, ...events])

    Note over Ctrl,UI: 6. Controller notifies subscribers
    Ctrl->>Ctrl: state = resolving → resolved
    Ctrl->>UI: 'resolved' listeners fire
    UI->>UI: useSyncExternalStore re-renders
```

#### Atom Resolution in Devtools

```mermaid
sequenceDiagram
    participant C as React Component
    participant H as useAtom(statsAtom)
    participant S as Devtools Scope
    participant Stats as statsAtom
    participant Events as eventsAtom

    C->>H: render()
    H->>S: scope.controller(statsAtom)
    H->>H: check ctrl.state

    alt state === 'idle'
        H->>Stats: ctrl.resolve()
        Note over Stats: statsAtom depends on eventsAtom
        Stats->>S: resolve deps
        S->>Events: scope.resolve(eventsAtom)
        Events-->>S: []
        S-->>Stats: { events: [] }
        Stats->>Stats: factory(ctx, { events })
        Stats-->>H: { total: 0, atoms: 0, ... }
        H->>H: subscribe to 'resolved'
        H-->>C: return stats
    else state === 'resolved'
        H->>Stats: ctrl.get()
        Stats-->>H: cached value
        H-->>C: return stats
    else state === 'resolving'
        H-->>C: throw Promise (Suspense)
    end
```

#### Devtools Atoms (Correct API)

```typescript
import { atom, flow, createScope, controller, typed } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

// ============================================
// Types
// ============================================

interface DevtoolsEvent {
  id: string
  type: 'atom:resolve' | 'atom:resolved' | 'flow:exec' | 'flow:complete' | 'error'
  timestamp: number
  name: string
  duration?: number
  deps?: string[]
  input?: unknown
  output?: unknown
  error?: { message: string; stack?: string }
}

interface EventFilter {
  types: DevtoolsEvent['type'][]
  search: string
}

interface Stats {
  total: number
  atoms: number
  flows: number
  errors: number
}

// ============================================
// Source Atoms (mutable state)
// ============================================

const eventsAtom = atom<DevtoolsEvent[]>({
  factory: (ctx) => {
    ctx.cleanup(() => {
      // Clear events on scope dispose
    })
    return []
  }
})

const selectedIndexAtom = atom<number | null>({
  factory: () => null
})

const filterAtom = atom<EventFilter>({
  factory: () => ({
    types: ['atom:resolved', 'flow:complete', 'error'],
    search: ''
  })
})

// ============================================
// Derived Atoms (computed from deps)
// ============================================

const filteredEventsAtom = atom<DevtoolsEvent[]>({
  deps: {
    events: eventsAtom,
    filter: filterAtom
  },
  factory: (ctx, { events, filter }) => {
    return events.filter(e =>
      filter.types.includes(e.type) &&
      (filter.search === '' || e.name.toLowerCase().includes(filter.search.toLowerCase()))
    )
  }
})

const selectedEventAtom = atom<DevtoolsEvent | null>({
  deps: {
    events: filteredEventsAtom,
    index: selectedIndexAtom
  },
  factory: (ctx, { events, index }) => {
    return index !== null && index < events.length ? events[index] : null
  }
})

const statsAtom = atom<Stats>({
  deps: {
    events: eventsAtom
  },
  factory: (ctx, { events }) => ({
    total: events.length,
    atoms: events.filter(e => e.type === 'atom:resolved').length,
    flows: events.filter(e => e.type === 'flow:complete').length,
    errors: events.filter(e => e.type === 'error').length,
  })
})

// ============================================
// Atoms with Controller Dependencies
// ============================================

// Example: Atom that watches another atom for changes
const autoScrollAtom = atom<boolean>({
  deps: {
    eventsCtrl: controller(eventsAtom)  // Get controller, not value
  },
  factory: (ctx, { eventsCtrl }) => {
    // Subscribe to events changes
    const unsub = eventsCtrl.on('resolved', () => {
      // Could trigger scroll behavior
      ctx.invalidate()  // Re-run this atom when events change
    })
    ctx.cleanup(unsub)
    return true  // Auto-scroll enabled by default
  }
})
```

#### Flows for Mutations

```mermaid
sequenceDiagram
    participant T as Transport
    participant Ctx as ExecutionContext
    participant Flow as addEventsFlow
    participant Ctrl as eventsAtom Controller
    participant Atom as eventsAtom

    T->>Ctx: scope.createContext()
    T->>Ctx: ctx.exec({ flow: addEventsFlow, input: { events } })

    Ctx->>Flow: parse input (typed<T>)
    Ctx->>Flow: factory(ctx, deps)

    Flow->>Ctrl: ctx.scope.controller(eventsAtom)
    Flow->>Ctrl: ctrl.update(prev => [...prev, ...events])

    Note over Ctrl,Atom: Controller schedules invalidation
    Ctrl->>Atom: run cleanups (LIFO)
    Ctrl->>Atom: state = resolving
    Note over Atom: set() skips factory, applies value directly
    Ctrl->>Atom: state = resolved
    Ctrl->>Ctrl: notify 'resolved' listeners

    Flow-->>Ctx: return void
    T->>Ctx: ctx.close()
    Ctx->>Ctx: run onClose cleanups
```

```typescript
// ============================================
// Flows (short-lived mutations)
// ============================================

// Flow to add events from transport
const addEventsFlow = flow<void, { events: DevtoolsEvent[] }>({
  name: 'addEvents',
  parse: typed<{ events: DevtoolsEvent[] }>(),
  factory: (ctx) => {
    const eventsCtrl = ctx.scope.controller(eventsAtom)
    eventsCtrl.update(prev => [...prev, ...ctx.input.events])
  }
})

// Flow for keyboard navigation
const navigateFlow = flow<void, { direction: 'up' | 'down' }>({
  name: 'navigate',
  parse: typed<{ direction: 'up' | 'down' }>(),
  deps: {
    events: filteredEventsAtom
  },
  factory: async (ctx, { events }) => {
    const indexCtrl = ctx.scope.controller(selectedIndexAtom)

    indexCtrl.update(prev => {
      if (ctx.input.direction === 'down') {
        return Math.min((prev ?? -1) + 1, events.length - 1)
      }
      if (ctx.input.direction === 'up') {
        return Math.max((prev ?? 0) - 1, 0)
      }
      return prev
    })
  }
})

// Flow to update filter
const setFilterFlow = flow<void, Partial<EventFilter>>({
  name: 'setFilter',
  parse: typed<Partial<EventFilter>>(),
  factory: (ctx) => {
    const filterCtrl = ctx.scope.controller(filterAtom)
    filterCtrl.update(prev => ({ ...prev, ...ctx.input }))
  }
})

// Flow to clear all events
const clearEventsFlow = flow<void, void>({
  name: 'clearEvents',
  factory: (ctx) => {
    const eventsCtrl = ctx.scope.controller(eventsAtom)
    const indexCtrl = ctx.scope.controller(selectedIndexAtom)

    eventsCtrl.set([])
    indexCtrl.set(null)
  }
})
```

#### Devtools Scope Setup

```mermaid
sequenceDiagram
    participant Main as Entry Point
    participant Scope as Devtools Scope
    participant T as Transport
    participant Ctx as ExecutionContext

    Main->>Scope: createScope()
    Scope-->>Main: scope

    Main->>Scope: await scope.ready
    Note over Scope: Extensions initialized (if any)

    Main->>Scope: scope.resolve(eventsAtom)
    Scope->>Scope: cache eventsAtom = []

    Main->>Scope: scope.resolve(statsAtom)
    Note over Scope: Resolves deps (eventsAtom already cached)
    Scope->>Scope: cache statsAtom = { total: 0, ... }

    Main->>T: transport.subscribe(callback)

    Note over T,Ctx: When transport receives events:
    T->>Scope: scope.createContext()
    Scope-->>T: ctx
    T->>Ctx: ctx.exec({ flow: addEventsFlow, input })
    Ctx-->>T: void
    T->>Ctx: ctx.close()
```

```typescript
import { createScope } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

interface MemoryTransport {
  send(events: DevtoolsEvent[]): void
  subscribe(cb: (events: DevtoolsEvent[]) => void): () => void
}

async function createDevtoolsScope(): Promise<Lite.Scope> {
  const scope = createScope()

  // Wait for any extensions to initialize
  await scope.ready

  // Pre-resolve atoms for immediate UI access
  // This ensures atoms are in 'resolved' state before rendering
  await scope.resolve(eventsAtom)
  await scope.resolve(statsAtom)
  await scope.resolve(filteredEventsAtom)
  await scope.resolve(selectedEventAtom)

  return scope
}

// Connect transport to devtools scope
function connectTransport(
  transport: MemoryTransport,
  devtoolsScope: Lite.Scope
): () => void {
  return transport.subscribe(async (events) => {
    const ctx = devtoolsScope.createContext()
    try {
      await ctx.exec({
        flow: addEventsFlow,
        input: { events }
      })
    } finally {
      await ctx.close()
    }
  })
}
```

#### TUI with react-lite + OpenTUI

```mermaid
sequenceDiagram
    participant Main as startTui()
    participant Scope as Devtools Scope
    participant WS as WebSocket Client
    participant Renderer as OpenTUI Renderer
    participant React as React Tree
    participant Hook as useAtom

    Main->>Scope: createDevtoolsScope()
    Scope-->>Main: scope (atoms pre-resolved)

    Main->>WS: connectWebSocket(port)
    Main->>WS: connectTransport(ws, scope)

    Main->>Renderer: createCliRenderer()
    Renderer-->>Main: renderer

    Main->>React: createRoot(renderer).render(<ScopeProvider>)

    Note over React,Hook: Component mounts
    React->>Hook: useAtom(statsAtom)
    Hook->>Scope: scope.controller(statsAtom)
    Hook->>Hook: ctrl.state === 'resolved'
    Hook->>Hook: ctrl.get() → stats
    Hook->>Hook: ctrl.on('resolved', rerender)
    Hook-->>React: stats value

    Note over WS,Hook: Events arrive from app
    WS->>Scope: ctx.exec(addEventsFlow)
    Scope->>Scope: eventsAtom updated
    Scope->>Scope: statsAtom invalidated (dep changed)
    Scope->>Hook: 'resolved' listener fires
    Hook->>React: trigger re-render
    React->>Hook: useAtom(statsAtom)
    Hook-->>React: new stats value
```

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react"
import { ScopeProvider, useScope, useAtom, useController } from "@pumped-fn/react-lite"
import { Suspense } from "react"

// ============================================
// Components
// ============================================

function Header() {
  const stats = useAtom(statsAtom)

  return (
    <box height={3} border borderStyle="single">
      <text style={{ color: "#61AFEF" }}>
        pumped-fn devtools |{" "}
        <span style={{ color: "#98C379" }}>Atoms: {stats.atoms}</span> |{" "}
        <span style={{ color: "#61AFEF" }}>Flows: {stats.flows}</span> |{" "}
        <span style={{ color: "#E06C75" }}>Errors: {stats.errors}</span>
      </text>
    </box>
  )
}

function EventRow({ event, selected }: { event: DevtoolsEvent; selected: boolean }) {
  const time = new Date(event.timestamp).toISOString().slice(11, 23)
  const icons: Record<string, string> = {
    'atom:resolve': '⚡', 'atom:resolved': '✓',
    'flow:exec': '▶', 'flow:complete': '✓', 'error': '✗',
  }
  const colors: Record<string, string> = {
    'atom:resolve': '#E5C07B', 'atom:resolved': '#98C379',
    'flow:exec': '#61AFEF', 'flow:complete': '#98C379', 'error': '#E06C75',
  }
  const duration = event.duration ? ` (${event.duration.toFixed(1)}ms)` : ''

  return (
    <box backgroundColor={selected ? "#1E3A5F" : "transparent"}>
      <text>
        <span style={{ color: "#5C6370" }}>{time}</span>{" "}
        <span style={{ color: colors[event.type] }}>{icons[event.type]}</span>{" "}
        <span style={{ color: "#ABB2BF" }}>{event.type.padEnd(14)}</span>{" "}
        <span style={{ color: "#C678DD" }}>{event.name}</span>
        <span style={{ color: "#5C6370" }}>{duration}</span>
      </text>
    </box>
  )
}

function Timeline() {
  const events = useAtom(filteredEventsAtom)
  const selectedIndex = useAtom(selectedIndexAtom)

  return (
    <scrollbox flex={1} border borderStyle="single">
      {events.map((event, i) => (
        <EventRow key={event.id} event={event} selected={i === selectedIndex} />
      ))}
    </scrollbox>
  )
}

function Details() {
  const event = useAtom(selectedEventAtom)

  if (!event) {
    return (
      <box height={8} border borderStyle="single">
        <text style={{ color: "#5C6370" }}>Select an event (j/k to navigate)</text>
      </box>
    )
  }

  return (
    <box height={8} border borderStyle="single" flexDirection="column">
      <text>
        <strong>Selected:</strong>{" "}
        <span style={{ color: "#C678DD" }}>{event.name}</span>
      </text>
      {event.input !== undefined && (
        <code language="json">{JSON.stringify(event.input, null, 2)}</code>
      )}
      {event.duration !== undefined && (
        <text>
          <span style={{ color: "#5C6370" }}>Duration:</span>{" "}
          <span style={{ color: "#98C379" }}>{event.duration.toFixed(1)}ms</span>
        </text>
      )}
      {event.error && (
        <text style={{ color: "#E06C75" }}>Error: {event.error.message}</text>
      )}
    </box>
  )
}

function StatusBar() {
  const events = useAtom(filteredEventsAtom)

  return (
    <box height={1}>
      <text style={{ color: "#5C6370" }}>
        j/k: navigate | c: clear | f: filter | q: quit | Events: {events.length}
      </text>
    </box>
  )
}

function DevtoolsApp() {
  const scope = useScope()
  const { height } = useTerminalDimensions()

  useKeyboard(async (key) => {
    const ctx = scope.createContext()
    try {
      if (key === 'j' || key === 'ArrowDown') {
        await ctx.exec({ flow: navigateFlow, input: { direction: 'down' } })
      }
      if (key === 'k' || key === 'ArrowUp') {
        await ctx.exec({ flow: navigateFlow, input: { direction: 'up' } })
      }
      if (key === 'c') {
        await ctx.exec({ flow: clearEventsFlow })
      }
      if (key === 'q') {
        process.exit(0)
      }
    } finally {
      await ctx.close()
    }
  })

  return (
    <box flexDirection="column" height="100%" width="100%">
      <Header />
      <Timeline />
      <Details />
      <StatusBar />
    </box>
  )
}

// ============================================
// Entry Point
// ============================================

export async function startTui(port: number) {
  // 1. Create isolated devtools scope
  const devtoolsScope = await createDevtoolsScope()

  // 2. Connect WebSocket transport
  const ws = new WebSocket(`ws://localhost:${port}`)
  const transport: MemoryTransport = {
    send: () => {},  // TUI is receive-only
    subscribe: (cb) => {
      ws.onmessage = (e) => cb(JSON.parse(e.data))
      return () => ws.close()
    }
  }
  const disconnect = connectTransport(transport, devtoolsScope)

  // 3. Create OpenTUI renderer
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })

  // 4. Render React tree with ScopeProvider
  createRoot(renderer).render(
    <ScopeProvider scope={devtoolsScope}>
      <Suspense fallback={<text>Loading...</text>}>
        <DevtoolsApp />
      </Suspense>
    </ScopeProvider>
  )

  return {
    scope: devtoolsScope,
    disconnect,
    destroy: () => {
      disconnect()
      renderer.destroy()
      devtoolsScope.dispose()
    }
  }
}
```

#### Web Panel with react-lite

```mermaid
sequenceDiagram
    participant App as Browser App
    participant Ext as DevtoolsExtension
    participant BC as BroadcastChannel
    participant Tab as Devtools Tab
    participant Scope as Devtools Scope
    participant React as React Components

    Note over App,BC: App emits events via BroadcastChannel
    App->>Ext: wrapResolve(next, atom, scope)
    Ext->>BC: bc.postMessage(events)

    Note over BC,Tab: Separate tab receives events
    BC->>Tab: bc.onmessage
    Tab->>Scope: ctx.exec(addEventsFlow)
    Scope->>React: atom updated → re-render
```

```tsx
import { useState, useEffect, Suspense } from "react"
import { ScopeProvider, useScope, useAtom, useController, useSelect } from "@pumped-fn/react-lite"
import type { Lite } from "@pumped-fn/lite"

// ============================================
// Web Components
// ============================================

function Stats() {
  // Fine-grained selection - only re-renders when stats change
  const total = useSelect(statsAtom, s => s.total)
  const atoms = useSelect(statsAtom, s => s.atoms)
  const flows = useSelect(statsAtom, s => s.flows)
  const errors = useSelect(statsAtom, s => s.errors)

  return (
    <div className="stats">
      <span>Total: {total}</span>
      <span className="atoms">Atoms: {atoms}</span>
      <span className="flows">Flows: {flows}</span>
      <span className="errors">Errors: {errors}</span>
    </div>
  )
}

function FilterBar() {
  const filter = useAtom(filterAtom)
  const scope = useScope()

  const updateFilter = async (updates: Partial<EventFilter>) => {
    const ctx = scope.createContext()
    await ctx.exec({ flow: setFilterFlow, input: updates })
    await ctx.close()
  }

  return (
    <div className="filter-bar">
      <input
        type="text"
        placeholder="Search..."
        value={filter.search}
        onChange={(e) => updateFilter({ search: e.target.value })}
      />
      <div className="type-filters">
        {(['atom:resolved', 'flow:complete', 'error'] as const).map(type => (
          <label key={type}>
            <input
              type="checkbox"
              checked={filter.types.includes(type)}
              onChange={(e) => updateFilter({
                types: e.target.checked
                  ? [...filter.types, type]
                  : filter.types.filter(t => t !== type)
              })}
            />
            {type}
          </label>
        ))}
      </div>
    </div>
  )
}

function Timeline() {
  const events = useAtom(filteredEventsAtom)
  const selectedIndex = useAtom(selectedIndexAtom)
  const indexCtrl = useController(selectedIndexAtom)

  return (
    <div className="timeline">
      {events.map((event, i) => (
        <div
          key={event.id}
          className={`event ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => indexCtrl.set(i)}
        >
          <span className="time">
            {new Date(event.timestamp).toISOString().slice(11, 23)}
          </span>
          <span className={`type ${event.type}`}>{event.type}</span>
          <span className="name">{event.name}</span>
          {event.duration && (
            <span className="duration">{event.duration.toFixed(1)}ms</span>
          )}
        </div>
      ))}
    </div>
  )
}

function Details() {
  const event = useAtom(selectedEventAtom)

  if (!event) {
    return <div className="details empty">Select an event</div>
  }

  return (
    <div className="details">
      <h3>{event.name}</h3>
      <dl>
        <dt>Type</dt><dd>{event.type}</dd>
        <dt>Time</dt><dd>{new Date(event.timestamp).toISOString()}</dd>
        {event.duration && <><dt>Duration</dt><dd>{event.duration.toFixed(2)}ms</dd></>}
        {event.deps && <><dt>Dependencies</dt><dd>{event.deps.join(', ')}</dd></>}
        {event.input !== undefined && (
          <>
            <dt>Input</dt>
            <dd><pre>{JSON.stringify(event.input, null, 2)}</pre></dd>
          </>
        )}
        {event.error && (
          <>
            <dt>Error</dt>
            <dd className="error">{event.error.message}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

function DevtoolsWebPanel() {
  return (
    <div className="devtools-panel">
      <header>
        <h1>pumped-fn devtools</h1>
        <Stats />
      </header>
      <FilterBar />
      <main>
        <Timeline />
        <Details />
      </main>
    </div>
  )
}

// ============================================
// Integration Components
// ============================================

// For in-page panel (memory transport)
export function InPageDevtools({ memoryTransport }: { memoryTransport: MemoryTransport }) {
  const [scope, setScope] = useState<Lite.Scope | null>(null)

  useEffect(() => {
    let cleanup: (() => void) | undefined

    createDevtoolsScope().then((s) => {
      setScope(s)
      cleanup = connectTransport(memoryTransport, s)
    })

    return () => {
      cleanup?.()
      scope?.dispose()
    }
  }, [memoryTransport])

  if (!scope) return <div>Loading devtools...</div>

  return (
    <ScopeProvider scope={scope}>
      <Suspense fallback={<div>Loading...</div>}>
        <DevtoolsWebPanel />
      </Suspense>
    </ScopeProvider>
  )
}

// For separate tab (BroadcastChannel)
export function StandaloneDevtools({ channel = 'pumped-devtools' }: { channel?: string }) {
  const [scope, setScope] = useState<Lite.Scope | null>(null)

  useEffect(() => {
    let bc: BroadcastChannel | undefined
    let cleanup: (() => void) | undefined

    createDevtoolsScope().then((s) => {
      setScope(s)

      bc = new BroadcastChannel(channel)
      const transport: MemoryTransport = {
        send: () => {},
        subscribe: (cb) => {
          bc!.onmessage = (e) => cb(e.data)
          return () => {}
        }
      }
      cleanup = connectTransport(transport, s)
    })

    return () => {
      cleanup?.()
      bc?.close()
      scope?.dispose()
    }
  }, [channel])

  if (!scope) return <div>Connecting to app...</div>

  return (
    <ScopeProvider scope={scope}>
      <Suspense fallback={<div>Loading...</div>}>
        <DevtoolsWebPanel />
      </Suspense>
    </ScopeProvider>
  )
}
```

#### Controller Reactivity Flow

```mermaid
sequenceDiagram
    participant User as User Action
    participant Ctrl as Controller
    participant Atom as eventsAtom
    participant Derived as statsAtom
    participant UI as React useAtom

    User->>Ctrl: ctrl.update(prev => [...prev, newEvent])

    Note over Ctrl,Atom: Controller schedules update
    Ctrl->>Atom: pendingSet = { fn }
    Ctrl->>Atom: scheduleInvalidation()

    Note over Atom: queueMicrotask processes
    Atom->>Atom: run cleanups (LIFO)
    Atom->>Atom: state = 'resolving'
    Atom->>Atom: apply pendingSet.fn(prev)
    Atom->>Atom: state = 'resolved'
    Atom->>Ctrl: notify 'resolved' listeners

    Note over Derived: Dependent atom invalidated
    Derived->>Derived: deps changed → auto-invalidate
    Derived->>Derived: re-run factory(ctx, { events })
    Derived->>Derived: state = 'resolved'

    Note over UI: React re-renders
    UI->>UI: useSyncExternalStore callback
    UI->>Ctrl: ctrl.get()
    Ctrl-->>UI: new value
```

#### Benefits of This Approach

| Benefit | How |
|---------|-----|
| **Isolation** | Devtools scope is separate from app scope - no interference |
| **Reactivity** | `ctrl.update()` → atom invalidates → derived atoms update → UI re-renders |
| **Derived state** | `filteredEventsAtom`, `statsAtom` auto-recompute when `eventsAtom` changes |
| **Fine-grained** | `useSelect(statsAtom, s => s.errors)` only re-renders on error count change |
| **Suspense** | `useAtom` throws Promise for idle/resolving → Suspense fallback |
| **Testable** | Same atoms work in TUI, web, and unit tests |
| **Type-safe** | Full TypeScript inference for deps, input, output |
| **Proof** | Demonstrates library capabilities at real scale |

### Phase 2: FlowExecution Integration

Once the approved FlowExecution design is implemented:

```typescript
interface EnhancedFlowExecEvent extends FlowExecEvent {
  executionId: string // From FlowExecution.id
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  abortController?: AbortController
}

// Track execution status changes
execution.onStatusChange((status, exec) => {
  devtools.emit('flow:status', {
    executionId: exec.id,
    status,
    timestamp: Date.now()
  })
})
```

## Data Available from Current APIs

| Data Point | Source | Method |
|------------|--------|--------|
| Atom name | `atom.factory.name` | Property access |
| Atom dependencies | `atom.deps` | Property access |
| Atom tags | `atom.tags` | Property access |
| Flow name | `flow.name` | Property access |
| Flow dependencies | `flow.deps` | Property access |
| Flow input | `ctx.input` | Property access |
| Execution tags | `options.tags` | Via wrapExec params |
| Scope tags | `scope.tags` | Property access (internal) |
| Controller state | `ctrl.state` | Property access |
| Current value | `ctrl.get()` | Method call |
| Resolution timing | `performance.now()` | Wrap measurement |

## Considerations

### Security
- Strip sensitive values in production
- Allow value serialization customization
- Rate limit event emission

### Performance
- Lazy initialization
- Event batching
- Off-thread processing (Web Workers)
- Tree-shakeable in production

### Compatibility
- Works with SSR (Node.js)
- Browser environments
- React Native (via custom transport)

## OpenTUI Integration (Recommended for Phase 1)

[OpenTUI](https://github.com/sst/opentui) is a TypeScript TUI library from SST that provides an excellent foundation for building a terminal-based devtools interface. It offers flexbox-based layouts, rich text styling, and interactive components.

### Why OpenTUI?

| Feature | Benefit for Devtools |
|---------|---------------------|
| TypeScript-first | Type-safe integration with pumped-fn |
| Flexbox layout (Yoga) | Complex dashboard layouts |
| React/Solid reconciler | Familiar component model |
| High performance (Zig) | Efficient event streaming |
| ScrollBox component | Timeline/log scrolling |
| Select component | Interactive navigation |
| Syntax highlighting | Code/value inspection |

### Architecture with OpenTUI

```mermaid
graph TB
    subgraph "pumped-fn Application"
        SCOPE[Scope]
        EXT[DevtoolsExtension]
    end

    subgraph "@pumped-fn/devtools-tui"
        EMITTER[EventEmitter]
        STORE[EventStore]
    end

    subgraph "OpenTUI Renderer"
        CLI[CliRenderer]
        ROOT[Root Container]
    end

    subgraph "UI Components"
        HEADER[Header Box]
        TIMELINE[Timeline ScrollBox]
        DETAILS[Details Panel]
        GRAPH[Dependency View]
    end

    SCOPE --> EXT
    EXT --> EMITTER
    EMITTER --> STORE
    STORE --> CLI
    CLI --> ROOT
    ROOT --> HEADER
    ROOT --> TIMELINE
    ROOT --> DETAILS
    ROOT --> GRAPH
```

### OpenTUI Components Mapping

| Devtools Feature | OpenTUI Component | Usage |
|-----------------|-------------------|-------|
| Event timeline | `ScrollBoxRenderable` | Scrollable log of events |
| Event details | `BoxRenderable` + `TextRenderable` | Selected event info |
| Navigation | `SelectRenderable` | Filter/navigate events |
| Value inspector | `CodeRenderable` | Syntax-highlighted JSON |
| Status bar | `BoxRenderable` | Scope stats, timing |
| Tabs | `TabSelectRenderable` | Switch views |

### Implementation Plan (Using @opentui/react)

Using the React reconciler for a declarative, familiar development experience:

```tsx
// tsconfig.json requirement:
// { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@opentui/react" } }

import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useState, useEffect, useCallback } from "react"
import { createDevtools, type DevtoolsEvent } from "@pumped-fn/devtools"

interface DevtoolsStore {
  events: DevtoolsEvent[]
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => DevtoolsEvent[]
}

function createDevtoolsStore(): DevtoolsStore {
  const events: DevtoolsEvent[] = []
  const listeners = new Set<() => void>()

  return {
    events,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => events,
    push: (event: DevtoolsEvent) => {
      events.push(event)
      listeners.forEach(l => l())
    }
  }
}

function useDevtoolsEvents(store: DevtoolsStore) {
  const [events, setEvents] = useState(store.getSnapshot())
  useEffect(() => store.subscribe(() => setEvents([...store.getSnapshot()])), [store])
  return events
}

function Header({ atomCount }: { atomCount: number }) {
  return (
    <box height={3} border borderStyle="single">
      <text style={{ color: "#61AFEF" }}>
        pumped-fn devtools{" "}
        <span style={{ color: "#98C379" }}>Atoms: {atomCount}</span>
      </text>
    </box>
  )
}

function EventRow({ event }: { event: DevtoolsEvent }) {
  const time = new Date(event.timestamp).toISOString().slice(11, 23)
  const icons: Record<string, string> = {
    'atom:resolve': '⚡', 'atom:resolved': '✓',
    'flow:exec': '▶', 'flow:complete': '✓', 'error': '✗',
  }
  const colors: Record<string, string> = {
    'atom:resolve': '#E5C07B', 'atom:resolved': '#98C379',
    'flow:exec': '#61AFEF', 'flow:complete': '#98C379', 'error': '#E06C75',
  }

  const name = 'atomName' in event ? event.atomName : event.flowName
  const duration = 'duration' in event ? ` (${event.duration.toFixed(1)}ms)` : ''

  return (
    <text>
      <span style={{ color: "#5C6370" }}>{time}</span>{" "}
      <span style={{ color: colors[event.type] }}>{icons[event.type]}</span>{" "}
      <span style={{ color: "#ABB2BF" }}>{event.type.padEnd(14)}</span>{" "}
      <span style={{ color: "#C678DD" }}>{name}</span>
      <span style={{ color: "#5C6370" }}>{duration}</span>
    </text>
  )
}

function Timeline({ events }: { events: DevtoolsEvent[] }) {
  return (
    <scrollbox flex={1} border borderStyle="single">
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </scrollbox>
  )
}

function Details({ event }: { event: DevtoolsEvent | null }) {
  if (!event) {
    return (
      <box height={8} border borderStyle="single">
        <text style={{ color: "#5C6370" }}>Select an event to view details</text>
      </box>
    )
  }

  const name = 'atomName' in event ? event.atomName : event.flowName
  const input = 'input' in event ? JSON.stringify(event.input, null, 2) : null

  return (
    <box height={8} border borderStyle="single" flexDirection="column">
      <text>
        <strong>Selected:</strong> <span style={{ color: "#C678DD" }}>{name}</span>
      </text>
      {input && (
        <code language="json">{input}</code>
      )}
      {'duration' in event && (
        <text>
          <span style={{ color: "#5C6370" }}>Duration:</span>{" "}
          <span style={{ color: "#98C379" }}>{event.duration.toFixed(1)}ms</span>
        </text>
      )}
    </box>
  )
}

function DevtoolsApp({ store }: { store: DevtoolsStore }) {
  const events = useDevtoolsEvents(store)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const { height } = useTerminalDimensions()

  useKeyboard((key) => {
    if (key === 'j' || key === 'ArrowDown') {
      setSelectedIndex(i => Math.min((i ?? -1) + 1, events.length - 1))
    }
    if (key === 'k' || key === 'ArrowUp') {
      setSelectedIndex(i => Math.max((i ?? 0) - 1, 0))
    }
    if (key === 'q') {
      process.exit(0)
    }
  })

  const selectedEvent = selectedIndex !== null ? events[selectedIndex] : null
  const atomCount = events.filter(e => e.type === 'atom:resolved').length

  return (
    <box flexDirection="column" height="100%" width="100%">
      <Header atomCount={atomCount} />
      <Timeline events={events} />
      <Details event={selectedEvent} />
      <box height={1}>
        <text style={{ color: "#5C6370" }}>
          j/k: navigate | q: quit | Events: {events.length}
        </text>
      </box>
    </box>
  )
}

export async function startDevtoolsTui() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })

  const store = createDevtoolsStore()

  const extension = createDevtools({
    onAtomResolve: (e) => store.push({ type: 'atom:resolve', ...e }),
    onAtomResolved: (e) => store.push({ type: 'atom:resolved', ...e }),
    onFlowExec: (e) => store.push({ type: 'flow:exec', ...e }),
    onFlowComplete: (e) => store.push({ type: 'flow:complete', ...e }),
    onError: (e) => store.push({ type: 'error', ...e }),
  })

  createRoot(renderer).render(<DevtoolsApp store={store} />)

  return {
    extension,
    destroy: () => renderer.destroy(),
  }
}
```

### OpenTUI React Components

| JSX Element | Purpose |
|-------------|---------|
| `<box>` | Flexbox container with border, padding |
| `<text>` | Text display with inline styling |
| `<scrollbox>` | Scrollable container for timeline |
| `<code>` | Syntax-highlighted code block |
| `<select>` | Interactive selection list |
| `<span>`, `<strong>`, `<em>` | Inline text modifiers |

### OpenTUI React Hooks

| Hook | Purpose |
|------|---------|
| `useKeyboard(handler)` | Handle keyboard input (j/k navigation) |
| `useTerminalDimensions()` | Reactive terminal size |
| `useRenderer()` | Access renderer for advanced ops |
| `useOnResize(callback)` | Terminal resize events |

### Example Output

```
┌─────────────────────────────────────────────────────────┐
│ pumped-fn devtools                          Atoms: 5    │
├─────────────────────────────────────────────────────────┤
│ 12:34:56.789 ⚡ atom:resolve    configAtom              │
│ 12:34:56.790 ✓ atom:resolved   configAtom (1.2ms)      │
│ 12:34:56.791 ⚡ atom:resolve    dbAtom                  │
│ 12:34:56.795 ✓ atom:resolved   dbAtom (4.1ms)          │
│ 12:34:56.800 ▶ flow:exec       fetchUserFlow           │
│ 12:34:56.850 ✓ flow:complete   fetchUserFlow (50.3ms)  │
│ 12:34:56.855 ⚡ atom:resolve    cacheAtom               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Selected: fetchUserFlow                                 │
│ Input: { id: "user-123" }                               │
│ Duration: 50.3ms | Dependencies: [dbAtom, cacheAtom]    │
└─────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
├── devtools/                    # Core extension (platform-agnostic)
│   ├── src/
│   │   ├── extension.ts         # Lite.Extension implementation
│   │   ├── events.ts            # Event types and formatters
│   │   ├── store.ts             # In-memory event storage
│   │   └── index.ts
│   └── package.json
│
├── devtools-tui/                # OpenTUI React-based terminal UI
│   ├── src/
│   │   ├── main.tsx             # Entry point, renderer setup
│   │   ├── App.tsx              # Root component
│   │   ├── components/
│   │   │   ├── Header.tsx       # Title bar with stats
│   │   │   ├── Timeline.tsx     # Scrollable event list
│   │   │   ├── EventRow.tsx     # Individual event display
│   │   │   ├── Details.tsx      # Selected event details
│   │   │   └── StatusBar.tsx    # Keyboard hints, counts
│   │   ├── hooks/
│   │   │   └── useDevtoolsEvents.ts
│   │   └── index.ts
│   ├── tsconfig.json            # jsxImportSource: @opentui/react
│   └── package.json
│
└── devtools-web/                # Browser React panel (future)
```

### Dependencies

```json
{
  "dependencies": {
    "@opentui/core": "^0.1.57",
    "@opentui/react": "^0.1.57",
    "@pumped-fn/devtools": "workspace:*",
    "react": "^18.0.0"
  }
}
```

### Requirements

- **Zig compiler** required for OpenTUI build
- Node.js 18+ / Bun recommended
- Terminal with true color support for best experience

### Caveats

- OpenTUI is still in development (not production-ready per their docs)
- Requires Zig toolchain for native bindings
- Browser environments not supported (terminal only)

## Next Steps

1. Create ADR for devtools architecture decision
2. Implement Phase 1 core extension (`@pumped-fn/devtools`)
3. Build OpenTUI-based terminal devtools (`@pumped-fn/devtools-tui`)
4. Design React devtools panel UI (Phase 2)
5. Plan browser extension architecture (Phase 3)
