# Patterns

Usage patterns as sequences. For API details, see `packages/lite/dist/index.d.mts`.

## A. Fundamental Usage

### Request Lifecycle

Model a request boundary with cleanup and shared context.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ctx as ExecutionContext
    participant Flow

    App->>Scope: createScope()
    App->>Scope: scope.createContext({ tags })
    Scope-->>App: ctx

    App->>Ctx: ctx.exec({ flow, input, tags })
    Ctx->>Flow: factory(childCtx, deps)
    Flow-->>Ctx: output
    Ctx->>Ctx: childCtx.close()
    Ctx-->>App: output

    App->>Ctx: ctx.onClose(cleanup)
    App->>Ctx: ctx.close()
    Ctx->>Ctx: run cleanups (LIFO)
```

### Extensions Pipeline

Observe and wrap timing for atoms/flows (logging, auth, tracing).

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ext as Extension
    participant Atom
    participant Flow

    App->>Scope: createScope({ extensions: [ext] })
    Scope->>Ext: ext.init(scope)
    App->>Scope: await scope.ready

    App->>Scope: resolve(atom)
    Scope->>Ext: wrapResolve(next, atom, scope)
    Ext->>Ext: before logic
    Ext->>Atom: next()
    Atom-->>Ext: value
    Ext->>Ext: after logic
    Ext-->>Scope: value

    App->>Scope: ctx.exec({ flow })
    Scope->>Ext: wrapExec(next, flow, ctx)
    Ext->>Flow: next()
    Flow-->>Ext: output
    Ext-->>Scope: output

    App->>Scope: dispose()
    Scope->>Ext: ext.dispose(scope)
```

### Scoped Isolation + Testing

Swap implementations and isolate tenants/tests.

```mermaid
sequenceDiagram
    participant Test
    participant Scope
    participant Atom

    Test->>Scope: createScope({ presets: [preset(dbAtom, mockDb)], tags: [tenantTag(id)] })
    Test->>Scope: resolve(dbAtom)
    Scope-->>Test: mockDb (not real db)

    Test->>Scope: createContext()
    Scope-->>Test: ctx with tenantTag
```

## B. Advanced Client/State Usage

### Controller Reactivity

Client-side state with lifecycle hooks and invalidation.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ctrl as Controller
    participant Atom

    App->>Scope: controller(atom)
    Scope-->>App: ctrl

    App->>Ctrl: ctrl.on('resolving' | 'resolved' | '*', listener)
    Ctrl-->>App: unsubscribe

    App->>Ctrl: ctrl.get()
    Ctrl-->>App: current value

    App->>Ctrl: ctrl.set(newValue)
    Ctrl->>Ctrl: notify listeners

    App->>Ctrl: ctrl.update(v => v + 1)
    Ctrl->>Ctrl: notify listeners

    App->>Ctrl: ctrl.invalidate()
    Ctrl->>Atom: re-run factory
    Ctrl->>Ctrl: notify listeners
```

### Ambient Context (Tags)

Propagate state without wiring parameters (app shell, user, locale).

```mermaid
sequenceDiagram
    participant App
    participant Ctx as ExecutionContext
    participant ChildCtx
    participant Data as ctx.data

    App->>Data: ctx.data.setTag(userTag, user)
    App->>Ctx: ctx.exec({ flow, tags: [localeTag('en')] })
    Ctx->>ChildCtx: create with merged tags

    ChildCtx->>Data: ctx.data.seekTag(userTag)
    Data-->>ChildCtx: user (from parent)

    ChildCtx->>Data: ctx.data.getTag(localeTag)
    Data-->>ChildCtx: 'en'
```

### Derived State (Select)

Subscribe to a slice of atom state with custom equality.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Handle as SelectHandle
    participant Atom

    App->>Scope: select(atom, v => v.count, { eq: shallowEqual })
    Scope-->>App: handle

    App->>Handle: handle.get()
    Handle-->>App: selected value

    App->>Handle: handle.subscribe(listener)
    Handle-->>App: unsubscribe

    Note over Atom,Handle: atom changes
    Handle->>Handle: eq(prev, next)?
    Handle->>App: notify if changed
```

### Service Pattern

Constrain atom methods to ExecutionContext-first signature for tracing/auth.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ctx as ExecutionContext
    participant Svc as Service Atom

    App->>Scope: resolve(userService)
    Scope-->>App: { getUser, updateUser }

    App->>Ctx: svc.getUser(ctx, userId)
    Ctx->>Svc: traced execution
    Svc-->>Ctx: user
    Ctx-->>App: user
```

### Typed Flow Input

Type flow input without runtime parsing overhead.

```mermaid
sequenceDiagram
    participant App
    participant Flow
    participant Ctx

    Note over Flow: flow({ parse: typed<T>(), factory })
    App->>Flow: ctx.exec({ flow, input: typedInput })
    Flow->>Flow: skip parse (type-only)
    Flow->>Ctx: factory(ctx) with ctx.input: T
    Ctx-->>App: output
```

### Controller as Dependency

Receive reactive handle instead of resolved value in atom/flow deps.

```mermaid
sequenceDiagram
    participant Scope
    participant AtomA as serverAtom
    participant Ctrl as Controller
    participant AtomB as configAtom

    Scope->>AtomA: resolve(serverAtom)
    Note over AtomA: deps: { cfg: controller(configAtom, { resolve: true }) }
    AtomA->>Scope: resolve configAtom first
    Scope-->>Ctrl: ctrl (already resolved)
    AtomA->>AtomA: factory(ctx, { cfg: ctrl })
    AtomA->>Ctrl: ctrl.on('resolved', () => ctx.invalidate())
    Note over AtomA: react to config changes
```

### Inline Function Execution

Execute ad-hoc logic within context without defining a flow.

```mermaid
sequenceDiagram
    participant App
    participant Ctx as ExecutionContext

    App->>Ctx: ctx.exec({ fn: (ctx, a, b) => a + b, params: [1, 2], tags })
    Ctx->>Ctx: create childCtx with tags
    Ctx->>Ctx: fn(childCtx, 1, 2)
    Ctx->>Ctx: childCtx.close()
    Ctx-->>App: 3
```

### Atom Retention (GC)

Control when atoms are garbage collected or kept alive indefinitely.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Atom

    App->>Scope: createScope({ gc: { enabled: true, graceMs: 3000 } })

    App->>Scope: resolve(atom)
    Scope-->>App: value
    Note over Scope: no refs → start grace timer

    alt keepAlive: true
        Note over Atom: never GC'd
    else graceMs expires
        Scope->>Atom: release()
        Atom->>Atom: run cleanups
    end

    App->>Scope: flush()
    Note over Scope: wait all pending
```
