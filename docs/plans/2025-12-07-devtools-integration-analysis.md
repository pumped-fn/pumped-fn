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

Create `@pumped-fn/devtools` package:

```typescript
interface DevtoolsOptions {
  onAtomResolve?: (event: AtomResolveEvent) => void
  onAtomResolved?: (event: AtomResolvedEvent) => void
  onFlowExec?: (event: FlowExecEvent) => void
  onFlowComplete?: (event: FlowCompleteEvent) => void
  onError?: (event: ErrorEvent) => void
}

interface AtomResolveEvent {
  id: string
  atom: Lite.Atom<unknown>
  atomName: string
  deps: string[]
  tags: Lite.Tagged<unknown>[]
  timestamp: number
}

interface AtomResolvedEvent extends AtomResolveEvent {
  duration: number
  value?: unknown // Optional, may be stripped
}

interface FlowExecEvent {
  id: string
  flow: Lite.Flow<unknown, unknown>
  flowName: string
  input: unknown
  tags: Lite.Tagged<unknown>[]
  timestamp: number
}

interface FlowCompleteEvent extends FlowExecEvent {
  duration: number
  output?: unknown
  error?: Error
}

function createDevtools(options?: DevtoolsOptions): Lite.Extension {
  return {
    name: 'devtools',

    init: (scope) => {
      // Track scope creation
    },

    wrapResolve: async (next, atom, scope) => {
      const event = createAtomResolveEvent(atom)
      options?.onAtomResolve?.(event)

      const start = performance.now()
      try {
        const result = await next()
        options?.onAtomResolved?.({
          ...event,
          duration: performance.now() - start,
          value: result
        })
        return result
      } catch (error) {
        options?.onError?.({ ...event, error })
        throw error
      }
    },

    wrapExec: async (next, target, ctx) => {
      const event = createFlowExecEvent(target, ctx)
      options?.onFlowExec?.(event)

      const start = performance.now()
      try {
        const result = await next()
        options?.onFlowComplete?.({
          ...event,
          duration: performance.now() - start,
          output: result
        })
        return result
      } catch (error) {
        options?.onError?.({ ...event, error })
        throw error
      }
    },

    dispose: (scope) => {
      // Cleanup, final stats
    }
  }
}
```

### Phase 2: React Integration

```typescript
// @pumped-fn/react-devtools
export function DevtoolsProvider({ children }: { children: React.ReactNode }) {
  const [events, addEvent] = useReducer(eventsReducer, [])

  const extension = useMemo(() => createDevtools({
    onAtomResolved: addEvent,
    onFlowComplete: addEvent
  }), [])

  return (
    <DevtoolsContext.Provider value={{ events, extension }}>
      {children}
    </DevtoolsContext.Provider>
  )
}

export function DevtoolsPanel() {
  const { events } = useDevtools()
  return (
    <div className="devtools-panel">
      <Timeline events={events} />
      <DependencyGraph events={events} />
      <StateInspector events={events} />
    </div>
  )
}
```

### Phase 3: FlowExecution Integration

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

### Implementation Plan

```typescript
import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  CodeRenderable,
} from "@opentui/core"
import { createDevtools, type DevtoolsEvent } from "@pumped-fn/devtools"

interface TuiDevtoolsOptions {
  targetFps?: number
  theme?: 'dark' | 'light'
}

async function createTuiDevtools(options?: TuiDevtoolsOptions) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: options?.targetFps ?? 30,
  })

  const events: DevtoolsEvent[] = []

  const layout = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    height: "100%",
    width: "100%",
  })

  const header = new BoxRenderable(renderer, {
    id: "header",
    height: 3,
    border: true,
    borderStyle: "single",
  })

  const headerText = new TextRenderable(renderer, {
    id: "header-text",
    content: "pumped-fn devtools",
    textColor: "#61AFEF",
  })

  const timeline = new ScrollBoxRenderable(renderer, {
    id: "timeline",
    flex: 1,
    border: true,
  })

  const details = new BoxRenderable(renderer, {
    id: "details",
    height: 10,
    border: true,
  })

  renderer.root.add(layout)
  layout.add(header)
  header.add(headerText)
  layout.add(timeline)
  layout.add(details)

  function addEvent(event: DevtoolsEvent) {
    events.push(event)
    const eventText = new TextRenderable(renderer, {
      id: `event-${event.id}`,
      content: formatEvent(event),
    })
    timeline.add(eventText)
  }

  const extension = createDevtools({
    onAtomResolve: (e) => addEvent({ type: 'atom:resolve', ...e }),
    onAtomResolved: (e) => addEvent({ type: 'atom:resolved', ...e }),
    onFlowExec: (e) => addEvent({ type: 'flow:exec', ...e }),
    onFlowComplete: (e) => addEvent({ type: 'flow:complete', ...e }),
    onError: (e) => addEvent({ type: 'error', ...e }),
  })

  return {
    extension,
    renderer,
    destroy: () => renderer.destroy(),
  }
}

function formatEvent(event: DevtoolsEvent): string {
  const time = new Date(event.timestamp).toISOString().slice(11, 23)
  const icon = {
    'atom:resolve': '⚡',
    'atom:resolved': '✓',
    'flow:exec': '▶',
    'flow:complete': '✓',
    'error': '✗',
  }[event.type]

  const name = 'atomName' in event ? event.atomName : event.flowName
  const duration = 'duration' in event ? ` (${event.duration.toFixed(1)}ms)` : ''

  return `${time} ${icon} ${event.type.padEnd(14)} ${name}${duration}`
}
```

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
├── devtools-tui/                # OpenTUI-based terminal UI
│   ├── src/
│   │   ├── renderer.ts          # OpenTUI setup
│   │   ├── components/
│   │   │   ├── Timeline.ts      # Event timeline
│   │   │   ├── Details.ts       # Event details panel
│   │   │   ├── DependencyGraph.ts
│   │   │   └── StatusBar.ts
│   │   └── index.ts
│   └── package.json
│
└── devtools-react/              # React panel (future)
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
