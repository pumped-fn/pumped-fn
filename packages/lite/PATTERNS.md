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
    Ctx->>Ctx: childCtx.close(result)
    Ctx-->>App: output

    App->>Ctx: ctx.onClose(result => cleanup)
    App->>Ctx: ctx.close(result?)
    Ctx->>Ctx: run onClose(CloseResult) LIFO
```

### Extensions Pipeline

Observe and wrap atoms/flows — logging, auth, tracing, transaction boundaries. Extensions register `onClose(CloseResult)` to finalize based on success or failure.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ext as Extension
    participant Atom
    participant Ctx as ExecutionContext
    participant Flow

    App->>Scope: createScope({ extensions: [ext] })
    Scope->>Ext: ext.init(scope)
    App->>Scope: await scope.ready

    App->>Scope: resolve(atom)
    Scope->>Ext: wrapResolve(next, { kind: "atom", target, scope })
    Ext->>Ext: before logic
    Ext->>Atom: next()
    Atom-->>Ext: value
    Ext->>Ext: after logic
    Ext-->>Scope: value

    App->>Ctx: ctx.exec({ flow })
    Ctx->>Ext: wrapExec(next, flow, childCtx)
    Ext->>Ext: ctx.onClose(result => result.ok ? commit : rollback)
    Ext->>Flow: next()
    Flow-->>Ext: output
    Ext-->>Ctx: output

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

Propagate values without wiring parameters. Tags serve two roles: scope-level config (consumed by atoms via `tags.required()`) and per-context ambient data (requestId, locale). Use `tags.required()` in deps to declare that an atom or flow needs an ambient value (e.g., a transacted connection) — extensions or context setup provide the value, the consumer just depends on it.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Atom
    participant Ctx as ExecutionContext
    participant ChildCtx
    participant Data as ctx.data

    App->>Scope: createScope({ tags: [configTag(cfg)] })
    App->>Scope: resolve(dbAtom)
    Note right of Atom: deps: { config: tags.required(configTag) }
    Scope->>Atom: factory(ctx, { config: cfg })

    App->>Scope: scope.createContext({ tags: [requestIdTag(rid)] })
    Scope-->>App: ctx

    App->>Ctx: ctx.exec({ flow, tags: [localeTag('en')] })
    Ctx->>ChildCtx: create with merged tags

    ChildCtx->>Data: ctx.data.seekTag(requestIdTag)
    Data-->>ChildCtx: rid (from parent)

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

Constrain atom methods to ExecutionContext-first signature. Always invoke via `ctx.exec` so a child context is created — extensions can observe the call, and cleanup is scoped.

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ctx as ExecutionContext
    participant Child as ChildContext
    participant Svc as Service Atom

    App->>Scope: resolve(userService)
    Scope-->>App: { getUser, updateUser }

    App->>Ctx: ctx.exec({ fn: svc.getUser, params: [userId] })
    Ctx->>Child: create child context
    Child->>Svc: getUser(childCtx, userId)
    Svc-->>Child: user
    Child->>Child: close(result)
    Child-->>App: user
```

### Typed Flow Input

Type flow input without runtime parsing overhead.

```mermaid
sequenceDiagram
    participant App
    participant Ctx as ExecutionContext
    participant Child as ChildContext
    participant Flow

    Note over Flow: flow({ parse: typed<T>(), factory })
    App->>Ctx: ctx.exec({ flow, input: typedInput })
    Ctx->>Child: create child (input passed through, no parse)
    Child->>Flow: factory(childCtx, deps) with ctx.input: T
    Flow-->>Child: output
    Child->>Child: close(result)
    Child-->>App: output
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

    App->>Ctx: ctx.exec({ name, fn, params, tags })
    Ctx->>Ctx: create childCtx (name + tags)
    Ctx->>Ctx: fn(childCtx, ...params)
    Ctx->>Ctx: childCtx.close(result)
    Ctx-->>App: output
    Note right of Ctx: name makes sub-executions observable by extensions
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
