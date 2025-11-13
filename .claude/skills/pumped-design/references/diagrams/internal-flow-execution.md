# Internal: Flow Execution Implementation

**Audience:** AI models and library contributors

## Implementation Flow

```mermaid
flowchart TD
    Resolve["scope.resolve executor"] --> GetState["getOrCreateState executor"]
    GetState --> CheckCache{Cached value?}

    CheckCache -->|Yes| ReturnCached[Return cached Promised]
    CheckCache -->|No| CreateAccessor[new AccessorImpl]

    CreateAccessor --> ProcessReplacer[processReplacer]
    ProcessReplacer --> CheckImmediate{Has immediateValue?}

    CheckImmediate -->|Yes| QueueMicro[queueMicrotask]
    CheckImmediate -->|No| CreateController[createController]

    QueueMicro --> StoreState["Store in state.value"]
    StoreState --> ReturnPromised[Return Promised]

    CreateController --> ResolveDeps[Resolve dependencies]
    ResolveDeps --> CreateExecCtx[new ExecutionContextImpl]
    CreateExecCtx --> InheritTags["tagStore inherits from parent"]
    InheritTags --> ExecuteFactory[Execute factory function]

    ExecuteFactory --> WrapExtensions[wrapWithExtensions]
    WrapExtensions --> RunFactory["factory deps, controller"]

    RunFactory --> CaptureResult[Capture return value]
    CaptureResult --> EndContext["ctx.end - set completedAt"]
    EndContext --> CacheResult["state.value = resolved"]
    CacheResult --> ReturnPromised

    RunFactory -->|Error| CaptureError["ctx.details.error = error"]
    CaptureError --> TriggerCleanup[triggerCleanup]
    TriggerCleanup --> ReverseCleanups[Array.reverse]
    ReverseCleanups --> ExecuteCleanups[await each cleanup]
    ExecuteCleanups --> TriggerError[triggerError via extensions]
    TriggerError --> ThrowError[Throw to caller]
```

## State Transitions

```mermaid
stateDiagram-v2
    [*] --> NoState: resolve() called
    NoState --> Creating: getOrCreateState()
    Creating --> Cached: existing state.value
    Creating --> Resolving: no cached value

    Resolving --> Immediate: "processReplacer()<br/>has immediateValue"
    Resolving --> FactoryExec: "processReplacer()<br/>has factory"

    Immediate --> Queued: queueMicrotask
    Queued --> Resolved: microtask executes

    FactoryExec --> DepsResolving: resolve dependencies
    DepsResolving --> Executing: dependencies ready
    Executing --> Resolved: factory returns
    Executing --> Failed: factory throws

    Failed --> Cleaning: triggerCleanup()
    Resolved --> Cleaning: on invalidation

    Cleaning --> Cleaned: all cleanups done
    Cleaned --> [*]
```

## Key Implementation Details

### ExecutorState Structure (scope.ts:30-40)

```typescript
type ExecutorState = {
  accessor: Core.Accessor<unknown>
  value?: Core.ResolveState<unknown>
  cleanups?: Set<Core.Cleanup>
  onUpdateCallbacks?: Set<OnUpdateFn>
  onUpdateExecutors?: Set<UE>
  onErrors?: Set<Core.ErrorCallback<unknown>>
  resolutionChain?: Set<UE>
  resolutionDepth?: number
  updateQueue?: Promise<void>
}
```

### Cleanup Execution (scope.ts:566-574)

```typescript
protected async "~triggerCleanup"(e: UE): Promise<void> {
  const state = this.cache.get(e)
  if (state?.cleanups) {
    // CRITICAL: reverse() for LIFO order
    for (const c of Array.from(state.cleanups.values()).reverse()) {
      await c()
    }
    delete state.cleanups
  }
}
```

### Context Parent Chain (execution-context.ts:40-54)

```typescript
this.tagStore = {
  get: (key: unknown) => {
    if (typeof key !== "symbol") return undefined
    if (this.tagData.has(key)) {
      return this.tagData.get(key)
    }
    // CRITICAL: Falls back to parent
    return this.parent?.tagStore.get(key)
  },
  set: (key: unknown, value: unknown) => {
    if (typeof key !== "symbol") return undefined
    const prev = this.tagData.get(key as symbol)
    this.tagData.set(key as symbol, value)
    return prev
  }
}
```

## Invariants

1. **Cleanup Order**: Always LIFO (scope.ts:569)
2. **Context Hierarchy**: Child always has reference to parent (execution-context.ts:7)
3. **Error Context**: Error stored in `details.error` before cleanup (execution-context.ts:82, 91)
4. **Microtask Delay**: Immediate values queued for consistency (scope.ts:86)
5. **Cache Coherence**: ExecutorState cached per executor (scope.ts:42)
