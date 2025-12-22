# Architectural Patterns

Design patterns implemented by `@pumped-fn/lite` and how to compose them for application architecture.

## Composite Patterns

### Request Lifecycle

**Combines:** IoC Container + Command + Composite

| GoF Pattern | Primitive |
|-------------|-----------|
| IoC Container | `Scope` (long-lived, caches atoms) |
| Command | `Flow` (operations within request) |
| Composite | `ExecutionContext` (parent-child with isolated data) |

**Key Insight:**
- `Scope` = application container (atoms cached here)
- `ExecutionContext` = request boundary (data lives here, closed at request end)
- `Flow` / `ctx.exec` = operations within the request (share context via `seekTag`)

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Context as ExecutionContext
    participant ServiceAtom as Service Atom
    participant Flow1 as Flow (validate)
    participant Flow2 as Flow (process)

    Note over Scope: Long-lived (app lifetime)
    App->>Scope: resolve(serviceAtom)
    Scope-->>App: service (cached)

    Note over Context: Per-request boundary
    App->>Scope: createContext({ tags: [requestId, userId] })
    Scope-->>App: ctx

    App->>Context: ctx.data.setTag(TX_TAG, beginTransaction())
    App->>Context: ctx.onClose(() => tx.rollback())

    App->>Context: ctx.exec({ flow: validateFlow, input })
    Context->>Scope: resolve flow deps (atoms)
    Scope-->>Context: deps (cached in scope)
    Context->>Flow1: factory(childCtx, deps)
    Note over Flow1: childCtx.parent = ctx
    Flow1->>Flow1: tags.required(userIdTag) from merged tags
    Flow1-->>Context: validated

    App->>Context: ctx.exec({ flow: processFlow, input: validated })
    Context->>Scope: resolve flow deps (atoms)
    Scope-->>Context: deps (from cache)
    Context->>Flow2: factory(childCtx, deps)
    Flow2->>Flow2: childCtx.exec({ fn: service.save, params: [data] })
    Note over Flow2: Creates grandchildCtx
    Flow2->>ServiceAtom: service.save(grandchildCtx, data)
    ServiceAtom->>ServiceAtom: grandchildCtx.data.seekTag(TX_TAG)
    Note over ServiceAtom: seekTag traverses parent chain
    ServiceAtom-->>Flow2: saved
    Flow2-->>Context: result

    App->>Context: ctx.data.getTag(TX_TAG).commit()
    App->>Context: ctx.close()
    Context->>Context: onClose cleanups run (rollback skipped)
```

**Characteristics:**
- Scope caches atoms across requests (resolve once, use many)
- ExecutionContext bounds request lifecycle (`onClose` for cleanup)
- Each `exec()` creates child context with isolated `data` Map
- `seekTag()` traverses parent chain for shared data (e.g., transaction)
- `ctx.close()` runs all `onClose` cleanups (LIFO order)
- On error: child context auto-closes, cleanups still run

**Primitives:** `createScope()`, `scope.createContext()`, `ctx.exec()`, `ctx.data.setTag/seekTag()`, `ctx.onClose()`, `ctx.close()`

---

### Flow Deps & Execution

**Combines:** Command + Composite + Resource Management

| Concern | Primitive |
|---------|-----------|
| Dependency injection | `deps` (atoms from Scope, tags from context hierarchy) |
| Service invocation | `ctx.exec({ fn, params })` (observable by extensions) |
| Resource cleanup | `ctx.onClose()` (LIFO, runs on success or failure) |

**Deps Resolution:**

```mermaid
flowchart TB
    subgraph Flow["flow({ deps, factory })"]
        Deps["deps: { db: dbAtom, userId: tags.required(userIdTag) }"]
    end

    subgraph Resolution
        Deps --> AtomPath["Atom deps"]
        Deps --> TagPath["Tag deps (TagExecutor)"]

        AtomPath --> Scope["Scope.resolve()"]
        Scope --> |"cached in scope"| ResolvedAtom["db instance"]

        TagPath --> CtxHierarchy["ctx.data.seekTag()"]
        CtxHierarchy --> |"traverses parent chain"| ResolvedTag["userId value"]
    end

    subgraph Factory["factory(ctx, { db, userId })"]
        ResolvedAtom --> DepsObj["deps object"]
        ResolvedTag --> DepsObj
    end
```

**Service Invocation:**

```mermaid
sequenceDiagram
    participant Flow
    participant Ctx as ExecutionContext
    participant Ext as Extension.wrapExec
    participant Fn as service.method

    Note over Flow: ❌ Direct call
    Flow->>Fn: service.method(ctx, data)
    Note over Fn: Extensions cannot observe

    Note over Flow: ✅ Via ctx.exec
    Flow->>Ctx: ctx.exec({ fn: service.method, params: [data] })
    Ctx->>Ctx: create childCtx (parent = ctx)
    Ctx->>Ext: wrapExec(next, fn, childCtx)
    Ext->>Fn: next()
    Fn-->>Ext: result
    Ext-->>Ctx: result
    Ctx->>Ctx: childCtx.close()
    Ctx-->>Flow: result
```

**Cleanup Pattern:**

```mermaid
sequenceDiagram
    participant Flow
    participant Ctx as ExecutionContext
    participant Tx as Transaction

    Flow->>Tx: beginTransaction()
    Tx-->>Flow: tx
    Flow->>Ctx: ctx.onClose(() => tx.rollback())

    alt Success
        Flow->>Flow: do work
        Flow->>Tx: tx.commit()
        Flow->>Ctx: return result
        Ctx->>Ctx: close() → rollback() is no-op
    else Error
        Flow->>Flow: do work (throws)
        Ctx->>Ctx: close() → rollback() executes
        Ctx->>Tx: tx.rollback()
    end
```

**Characteristics:**
- Atoms resolve via `Scope.resolve()` (cached, long-lived)
- Tag deps resolve via `ctx.data.seekTag()` (traverses parent → grandparent → scope tags)
- `ctx.exec({ fn, params })` creates child context with isolated `data` Map
- Extensions intercept via `wrapExec(next, target, ctx)`
- Register pessimistic cleanup via `ctx.onClose(fn)`, neutralize on success

**Primitives:** `flow({ deps })`, `tags.required()`, `tags.optional()`, `tags.all()`, `ctx.exec()`, `ctx.onClose()`

---

### Request Pipeline

**Combines:** Command + Interceptor + Context Object

| GoF Pattern | Primitive |
|-------------|-----------|
| Command | `Flow` (encapsulates request with input/output) |
| Interceptor | `Extension.wrapExec()` (wraps execution) |
| Context Object | `Tag` (propagates metadata without explicit passing) |

```mermaid
sequenceDiagram
    participant Client
    participant Scope
    participant Extension1 as Extension (Auth)
    participant Extension2 as Extension (Tracing)
    participant Flow
    participant Context as ExecutionContext

    Client->>Scope: createContext({ tags: [requestId] })
    Scope-->>Client: ctx
    Client->>Context: exec({ flow, input, tags: [userId] })

    Context->>Context: merge tags (flow → scope → context → exec)
    Context->>Context: create child context

    Context->>Extension1: wrapExec(next, flow, childCtx)
    Extension1->>Extension1: extract userId tag, validate
    Extension1->>Extension2: next()
    Extension2->>Extension2: read parent span from ctx.parent?.data
    Extension2->>Extension2: create child span, store in ctx.data
    Extension2->>Flow: next()
    Flow->>Flow: factory(ctx, deps) with tags.required(userId)
    Flow-->>Extension2: result
    Extension2->>Extension2: end span
    Extension2-->>Extension1: result
    Extension1-->>Context: result
    Context->>Context: auto-close child (run onClose cleanups)
    Context-->>Client: result
```

**Characteristics:**
- Extensions wrap in registration order (outer → inner)
- Each `exec()` creates isolated child context with own `data` Map
- Tags merge with later sources winning (exec tags override flow tags)
- Parent chain enables span correlation without AsyncLocalStorage

**Primitives:** `flow()`, `Extension.wrapExec`, `tag()`, `ctx.exec()`, `ctx.parent`, `ctx.data`

---

### Scoped Isolation

**Combines:** IoC Container + Strategy + Composite

| GoF Pattern | Primitive |
|-------------|-----------|
| IoC Container | `Scope` (manages atom lifecycles and resolution) |
| Strategy | `Preset` (swap implementations at scope creation) |
| Composite | `ExecutionContext` (parent-child isolation) |

```mermaid
sequenceDiagram
    participant App
    participant TenantScope as Scope (Tenant A)
    participant TestScope as Scope (Test)
    participant DbAtom as dbAtom
    participant MockDb as mockDbAtom

    Note over App: Production - Tenant A
    App->>TenantScope: createScope({ tags: [tenantId('A')] })
    App->>TenantScope: resolve(dbAtom)
    TenantScope->>DbAtom: factory(ctx, deps)
    DbAtom->>DbAtom: tags.required(tenantId) → 'A'
    DbAtom-->>TenantScope: TenantA DB connection

    Note over App: Test - Mocked DB
    App->>TestScope: createScope({ presets: [preset(dbAtom, mockDbAtom)] })
    App->>TestScope: resolve(dbAtom)
    TestScope->>TestScope: check presets → found
    TestScope->>MockDb: resolve mockDbAtom instead
    MockDb-->>TestScope: Mock DB instance

    Note over App: Parallel tenant contexts
    par Tenant A request
        TenantScope->>TenantScope: createContext({ tags: [requestId('r1')] })
    and Tenant B request
        TenantScope->>TenantScope: createContext({ tags: [requestId('r2')] })
    end
    Note over TenantScope: Each context isolated, same scope
```

**Characteristics:**
- Each Scope is an isolated DI container with own cache
- Presets swap atom implementations without changing definitions
- Tags at scope level apply to all resolutions
- Multiple ExecutionContexts share scope but isolate request data
- Child contexts inherit parent tags, can override

**Use Cases:**
- Multi-tenancy: scope-level tenant tag, context-level request isolation
- Testing: preset mocks without touching production atom definitions
- Feature flags: preset alternative implementations per environment

**Primitives:** `createScope()`, `preset()`, `tag()`, `createContext()`, scope `tags` option

---

## Foundational Patterns

### IoC Container

**GoF:** Inversion of Control / Dependency Injection Container

```mermaid
graph TB
    Scope["Scope (Container)"]
    AtomA["Atom A"]
    AtomB["Atom B"]
    AtomC["Atom C"]
    Cache["Resolution Cache"]

    Scope -->|resolve| AtomA
    Scope -->|resolve| AtomB
    AtomB -->|deps| AtomA
    AtomC -->|deps| AtomA
    AtomC -->|deps| AtomB
    Scope --- Cache
```

**Primitives:** `createScope()`, `atom()`, `deps`, `scope.resolve()`

**Characteristics:** Lazy resolution, automatic caching, dependency graph traversal, circular dependency detection.

---

### Observer

**GoF:** Observer Pattern with State Machine

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> resolving: resolve()
    resolving --> resolved: success
    resolving --> failed: error
    resolved --> resolving: invalidate()
    failed --> resolving: invalidate()

    note right of resolving: listeners notified
    note right of resolved: listeners notified
```

**Primitives:** `controller()`, `ctrl.on('resolved' | 'resolving' | '*')`, `ctrl.invalidate()`

**Characteristics:** State-filtered subscriptions, LIFO cleanup before re-resolution, sequential invalidation chains with loop detection.

---

### Context Object

**GoF:** Context Object / Ambient Context

```mermaid
graph TB
    subgraph Sources
        FlowTags[Flow tags]
        ScopeTags[Scope tags]
        CtxTags[Context tags]
        ExecTags[Exec tags]
    end

    subgraph Merge[Tag Merge - later wins]
        FlowTags --> Merged
        ScopeTags --> Merged
        CtxTags --> Merged
        ExecTags --> Merged
    end

    subgraph Extract
        Merged --> Required[tags.required]
        Merged --> Optional[tags.optional]
        Merged --> All[tags.all]
    end
```

**Primitives:** `tag()`, `tags.required()`, `tags.optional()`, `tags.all()`, `Tagged`

**Characteristics:** Implicit propagation through execution layers, type-safe extraction, merge precedence (exec > context > scope > flow).

---

### Strategy

**GoF:** Strategy Pattern

```mermaid
graph TB
    Scope -->|resolve| Atom
    Atom -->|check| Presets{Preset?}
    Presets -->|value| Direct[Return value]
    Presets -->|atom| Redirect[Resolve other atom]
    Presets -->|none| Factory[Run factory]
```

**Primitives:** `preset()`, `createScope({ presets })`, `isPreset()`

**Characteristics:** Swap implementations at scope creation, value injection bypasses factory, atom redirection for mock substitution.
