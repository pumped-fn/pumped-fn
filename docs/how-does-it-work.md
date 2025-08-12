# introduction

`@pumped-fn/core-next` tried its best to stay on very low amount of APIs, it makes programming fun, ease on importing and also LLM-friendly

## primitives

### executors

Executor is the atom of `pumped-fn`. At its heart, it's measely an object to be used as a reference. It contains the factory function, dependencies and metas

Executor has a few references used as signal the scope to treat the graph of dependencies slightly differently

- `lazy` is a representation of an Executor at the Scope. It gives you the access to the Accessor. It fuels conditional dependency, lazy evalution
- `reactive` is a Reactive indicator of an Executor at the Scope. When a value depending on a reactive variation, whenever the main Executor got updated, the factory will be triggered
- `static` is a static representation of an Executor at the Scope. Similar to .lazy, the major different is `static` will also resolve the dependency graph prior to triggering the factory

### scope

Scope is a container. Each scope is isolated, and has its own lifecycle, and can be applied using different middlewares. An application can have as many scope as it wants, despite most of them actually requires only one

Scope only know about the Executors which `resolve` by it, as such the dependency graph is local to a scope.

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

### lifecycle
