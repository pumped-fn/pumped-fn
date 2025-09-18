# Graph Resolution Fundamentals

`@pumped-fn/core-next` implements graph-based dependency resolution - a paradigm that transforms how you build and organize applications.

## Core Principles

### 1. Dependency Graph Structure
Every application is a graph of dependencies. Instead of manually wiring components, you define the graph structure and let the library resolve it:

```typescript
// Define the graph nodes
const config = provide(() => loadConfig())
const logger = derive([config], ([cfg]) => createLogger(cfg.logLevel))
const db = derive([config, logger], ([cfg, log]) => connectDB(cfg.database, log))
const app = derive([db, logger], ([database, log]) => createApp(database, log))

// Resolve the entire graph with one call
const resolvedApp = await scope.resolve(app)
```

### 2. Automatic Resolution Order
The library topologically sorts dependencies and resolves them in the correct order:
- `config` resolves first (no dependencies)
- `logger` resolves second (depends on `config`)
- `db` resolves third (depends on `config` and `logger`)
- `app` resolves last (depends on `db` and `logger`)

### 3. Singleton Caching
Each executor resolves exactly once per scope. Multiple dependents share the same resolved instance:

```typescript
const sharedConfig = provide(() => expensiveConfigLoad())
const serviceA = derive([sharedConfig], ([cfg]) => createServiceA(cfg))
const serviceB = derive([sharedConfig], ([cfg]) => createServiceB(cfg))

// sharedConfig resolves only once, both services get same instance
await scope.resolve([serviceA, serviceB])
```

### 4. Lazy Evaluation
Graph nodes only resolve when needed, enabling conditional dependencies and performance optimization:

```typescript
const expensiveService = provide(() => createExpensiveService())
const conditionalFeature = derive([config, expensiveService.lazy], ([cfg, lazy]) => {
  if (cfg.enableFeature) {
    return lazy.get() // Only resolves expensiveService if needed
  }
  return null
})
```

## Graph vs Traditional Patterns

### Traditional Approach Problems
```typescript
// Manual dependency management - error prone
class Application {
  constructor() {
    this.config = new Config()           // Order matters
    this.logger = new Logger(this.config) // Must come after config
    this.db = new DB(this.config, this.logger) // Must come after both
    this.api = new API(this.db, this.logger)   // Must come last
  }
}

// Testing requires complex mocking
const mockConfig = { test: true }
const mockLogger = { log: jest.fn() }
const mockDB = { query: jest.fn() }
const app = new Application()
// How do you inject the mocks?
```

### Graph Resolution Solution
```typescript
// Dependencies declared where they're used
const config = provide(() => loadConfig())
const logger = derive([config], ([cfg]) => createLogger(cfg))
const db = derive([config, logger], ([cfg, log]) => connectDB(cfg, log))
const api = derive([db, logger], ([database, log]) => createAPI(database, log))

// Testing: replace any node, entire graph adapts
const testScope = createScope(preset(config, { test: true }))
const result = await testScope.resolve(api) // Uses test config throughout
```

## Primitives

### executors

Executor is the atom of `pumped-fn`. At its heart, it's measely an object to be used as a reference. It contains the factory function, dependencies and metas

Executor has a few references used as signal the scope to treat the graph of dependencies slightly differently

- `lazy` is a representation of an Executor at the Scope. It gives you the access to the Accessor. It fuels conditional dependency, lazy evalution
- `reactive` is a Reactive indicator of an Executor at the Scope. When a value depending on a reactive variation, whenever the main Executor got updated, the factory will be triggered
- `static` is a static representation of an Executor at the Scope. Similar to .lazy, the major different is `static` will also resolve the dependency graph prior to triggering the factory

### scope

Scope is a container. Each scope is isolated, and has its own lifecycle, and can be applied using different plugins. An application can have as many scope as it wants, despite most of them actually requires only one

Scope only know about the Executors which `resolve` by it, as such the dependency graph is local to a scope.

### plugins

Plugins provide a powerful event-driven system for intercepting and modifying the executor resolution pipeline. They operate through event hooks that are triggered during resolution, update, and release operations.

The plugin system consists of:
- **Plugin Interface**: `init` and `dispose` lifecycle hooks
- **Event Callbacks**: `onChange` for resolve/update events, `onRelease` for cleanup
- **Value Transformation**: Return `preset()` to override resolved/updated values

## resolution flow

### standard resolution

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant Cache as Cache Store
    participant DepGraph as Dependency Graph
    participant Executor
    participant Factory
    
    Client->>+Scope: resolve(executorA)
    Scope->>Cache: lookup(executorA)
    
    alt Cache Hit
        Cache-->>Scope: cachedValue
        Scope-->>Client: return cachedValue
    else Cache Miss
        Scope->>DepGraph: getDependencies(executorA)
        DepGraph-->>Scope: [executorB, executorC]
        
        loop For each dependency
            Scope->>+Scope: resolve(dependency)
            Note over Scope: Recursive resolution
            Scope-->>-Scope: dependencyValue
        end
        
        Scope->>Executor: getFactory()
        Executor-->>Scope: factory function
        Scope->>+Factory: execute(depValues)
        Factory-->>-Scope: computedValue
        
        Scope->>Cache: store(executorA, computedValue)
        Scope->>DepGraph: registerResolution(executorA)
        Scope-->>-Client: return computedValue
    end
```

### lazy resolution

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant Accessor
    participant Cache
    participant Factory
    
    Client->>+Scope: resolve(executor.lazy)
    Scope->>Accessor: create(executor, scope)
    Scope-->>-Client: return Accessor
    
    Note over Client: Later, when value needed
    
    Client->>+Accessor: get()
    Accessor->>Cache: lookup(executor)
    
    alt Cache Hit
        Cache-->>Accessor: cachedValue
        Accessor-->>Client: return cachedValue
    else Cache Miss
        Accessor->>+Scope: resolve(executor)
        Note over Scope: Standard resolution flow
        Scope-->>-Accessor: computedValue
        Accessor-->>-Client: return computedValue
    end
```

### static resolution with dependency pre-resolution

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant DepResolver as Dependency Resolver
    participant Cache
    participant Factory
    
    Client->>+Scope: resolve(executor.static)
    Scope->>+DepResolver: resolveAllDependencies(executor)
    
    loop Depth-first traversal
        DepResolver->>DepResolver: findDependencies(current)
        DepResolver->>+Scope: resolve(dependency)
        Scope-->>-DepResolver: dependencyValue
        DepResolver->>Cache: warmCache(dependency, value)
    end
    
    DepResolver-->>-Scope: dependencyMap
    
    Note over Scope: All deps pre-resolved
    
    Scope->>Factory: execute(dependencyMap)
    Factory-->>Scope: computedValue
    Scope->>Cache: store(executor, computedValue)
    Scope-->>-Client: return computedValue
```

## update flow

### reactive update propagation

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant UpdateQueue
    participant DepGraph as Dependency Graph
    participant Cache
    participant Listeners
    participant Factory
    
    Client->>+Scope: update(executorA, newValue)
    
    Scope->>Cache: invalidate(executorA)
    Scope->>Cache: store(executorA, newValue)
    
    Scope->>DepGraph: getReactiveDependents(executorA)
    DepGraph-->>Scope: [executorB.reactive, executorC.reactive]
    
    Scope->>UpdateQueue: enqueue([executorB, executorC])
    
    loop Process update queue
        UpdateQueue->>Scope: nextExecutor
        
        alt Is Reactive Dependent
            Scope->>DepGraph: getDependencies(nextExecutor)
            DepGraph-->>Scope: dependencies
            
            par Parallel dependency resolution
                Scope->>Cache: getValue(dep1)
                and
                Scope->>Cache: getValue(dep2)
            end
            
            Scope->>Factory: execute(dependencies)
            Factory-->>Scope: newComputedValue
            
            Scope->>Cache: store(nextExecutor, newComputedValue)
            Scope->>Listeners: notify(nextExecutor, newComputedValue)
            
            Scope->>DepGraph: getReactiveDependents(nextExecutor)
            DepGraph-->>Scope: moreDependents
            Scope->>UpdateQueue: enqueue(moreDependents)
        else Not Reactive
            Note over Scope: Skip non-reactive
        end
    end
    
    Scope->>Listeners: notifyComplete()
    Scope-->>-Client: updateComplete
```

### batch update optimization

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant BatchManager
    participant UpdateQueue
    participant Cache
    participant Factory
    
    Client->>+Scope: startBatch()
    Scope->>BatchManager: initBatch()
    
    Client->>Scope: update(executorA, value1)
    Scope->>BatchManager: queueUpdate(executorA, value1)
    
    Client->>Scope: update(executorB, value2)
    Scope->>BatchManager: queueUpdate(executorB, value2)
    
    Client->>Scope: update(executorC, value3)
    Scope->>BatchManager: queueUpdate(executorC, value3)
    
    Client->>+Scope: endBatch()
    
    Scope->>BatchManager: processBatch()
    BatchManager->>BatchManager: deduplicateUpdates()
    BatchManager->>BatchManager: topologicalSort()
    
    loop For each update in sorted order
        BatchManager->>Cache: store(executor, value)
        BatchManager->>UpdateQueue: enqueueReactiveDependents(executor)
    end
    
    BatchManager->>UpdateQueue: processAll()
    
    loop Process reactive updates once
        UpdateQueue->>Factory: recompute(dependent)
        Factory-->>UpdateQueue: newValue
        UpdateQueue->>Cache: store(dependent, newValue)
    end
    
    Scope-->>-Client: batchComplete
```

## executor lifecycle management

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant Executor
    participant Cache
    participant GC as Garbage Collector
    participant Listeners
    
    Note over Client,Listeners: Creation Phase
    
    Client->>Executor: provide(factory, ...metas)
    Executor-->>Client: executor instance
    
    Note over Client,Listeners: Resolution Phase
    
    Client->>+Scope: resolve(executor)
    Scope->>Cache: store(executor, value)
    Scope->>Listeners: register(executor)
    Scope-->>-Client: value
    
    Note over Client,Listeners: Active Phase
    
    loop During application lifecycle
        Client->>Scope: update(executor, newValue)
        Scope->>Listeners: notify(executor, newValue)
    end
    
    Note over Client,Listeners: Disposal Phase
    
    Client->>+Scope: dispose(executor)
    Scope->>Listeners: unregister(executor)
    Scope->>Cache: evict(executor)
    Scope->>GC: markForCollection(executor)
    
    opt Has cleanup function
        Scope->>Executor: runCleanup()
    end
    
    Scope-->>-Client: disposed
```

## error handling and recovery

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant ErrorBoundary
    participant Factory
    participant Cache
    participant Fallback
    
    Client->>+Scope: resolve(executor)
    
    Scope->>+Factory: execute(deps)
    
    alt Factory throws error
        Factory-->>-Scope: throw Error
        Scope->>ErrorBoundary: handleError(executor, error)
        
        alt Has fallback
            ErrorBoundary->>Fallback: getFallback(executor)
            Fallback-->>ErrorBoundary: fallbackValue
            ErrorBoundary->>Cache: store(executor, fallbackValue)
            ErrorBoundary->>Scope: logError(error)
            Scope-->>Client: return fallbackValue
        else No fallback
            ErrorBoundary->>Cache: markAsErrored(executor)
            ErrorBoundary->>Scope: propagateError(error)
            Scope-->>-Client: throw Error
        end
    else Factory succeeds
        Factory-->>Scope: value
        Scope->>Cache: store(executor, value)
        Scope-->>Client: return value
    end
```

## middleware flow

### middleware interception during resolution

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant Middleware
    participant Factory
    participant Cache
    participant Events
    
    Client->>+Scope: resolve(executor)
    Scope->>Factory: execute(dependencies)
    Factory-->>Scope: computedValue
    
    Note over Scope,Events: Middleware Interception Point
    
    Scope->>Events: trigger onChange listeners
    
    loop For each onChange listener
        Events->>+Middleware: onChange("resolve", executor, value, scope)
        
        alt Middleware transforms value
            Middleware-->>-Events: preset(executor, transformedValue)
            Events->>Scope: updateValue(transformedValue)
        else No transformation
            Middleware-->>Events: void
        end
    end
    
    Scope->>Cache: store(executor, finalValue)
    Scope-->>-Client: return finalValue
```

### middleware during update propagation

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant Middleware
    participant Cache
    participant ReactiveQueue
    
    Client->>+Scope: update(executor, newValue)
    
    Note over Scope,Middleware: Pre-update middleware
    
    Scope->>Middleware: onChange("update", executor, newValue, scope)
    
    alt Middleware transforms value
        Middleware-->>Scope: preset(executor, transformedValue)
        Scope->>Scope: use transformedValue
    else No transformation
        Middleware-->>Scope: void
        Scope->>Scope: use newValue
    end
    
    Scope->>Cache: store(executor, finalValue)
    
    Scope->>ReactiveQueue: findReactiveDependents(executor)
    ReactiveQueue-->>Scope: [dependent1, dependent2]
    
    loop For each reactive dependent
        Scope->>Scope: resolve(dependent, force=true)
        Note over Scope: Middleware also intercepts these
    end
    
    Scope-->>-Client: updateComplete
```

### middleware lifecycle management

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Scope
    participant MiddlewareStack
    participant Middleware1
    participant Middleware2
    
    Note over Client,Middleware2: Registration Phase
    
    Client->>+Scope: use(middleware1)
    Scope->>MiddlewareStack: register(middleware1)
    Scope->>Middleware1: init(scope)
    Middleware1->>Scope: setup event listeners
    Scope-->>Client: cleanup1
    
    Client->>Scope: use(middleware2)
    Scope->>MiddlewareStack: register(middleware2)
    Scope->>Middleware2: init(scope)
    Middleware2->>Scope: setup event listeners
    Scope-->>-Client: cleanup2
    
    Note over Client,Middleware2: Active Phase
    
    loop During scope lifetime
        Client->>Scope: resolve/update operations
        Scope->>MiddlewareStack: trigger events
        MiddlewareStack->>Middleware1: event callback
        MiddlewareStack->>Middleware2: event callback
    end
    
    Note over Client,Middleware2: Disposal Phase
    
    Client->>+Scope: dispose()
    
    Scope->>Middleware1: dispose(scope)
    Middleware1-->>Scope: cleanup complete
    
    Scope->>Middleware2: dispose(scope)
    Middleware2-->>Scope: cleanup complete
    
    Scope->>MiddlewareStack: clear()
    Scope-->>-Client: disposed
```

### lifecycle
