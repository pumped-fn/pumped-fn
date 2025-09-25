# @pumped-fn/core-next API Reference

_Compressed API surface for LLM discovery and type-safe access_

---

## Core Symbols & Constants

```typescript
executorSymbol: unique symbol // Symbol.for("@pumped-fn/core/executor")
metaSymbol: unique symbol     // Symbol.for("@pumped-fn/core/meta")
name: Meta.MetaFn<string>     // Pre-configured meta for naming executors
```

---

## Executor System

### Creation
```typescript
provide<T>(factory: () => T | Promise<T>): Core.Executor<T>
derive<T, D>(deps: D, factory: (deps, scope) => T | Promise<T>): Core.Executor<T>
preset<T>(executor: Core.Executor<T>, value: T): Core.Preset<T>

// Executor variants accessible as properties
executor.{lazy|reactive|static} // lazy: on-demand, reactive: triggers updates, static: permanent cache
```

### Type Guards
```typescript
is{Executor|MainExecutor|LazyExecutor|ReactiveExecutor|StaticExecutor|Preset}(input: unknown): boolean
```

---

## Scope Management

### Creation
```typescript
createScope(options?: { extensions?: Extension[], meta?: Meta[], initialValues?: Preset[] }): Core.Scope
createScope(...presets: Core.Preset[]): Core.Scope
```

### Operations

| Category | Methods | Returns | Purpose |
|----------|---------|---------|---------|
| **Resolution** | `resolve(executor, force?)` | `Promise<T>` | Get executor value |
| | `resolveAccessor(executor)` | `Promise<Accessor<T>>` | Get accessor |
| | `accessor(executor, eager?)` | `Accessor<T>` | Get accessor directly |
| **Updates** | `update(executor, fn)` | `Promise<void>` | Update with function |
| | `set(executor, value)` | `Promise<void>` | Set new value |
| **Lifecycle** | `release(executor, soft?)` | `Promise<void>` | Release single executor |
| | `dispose()` | `Promise<void>` | Dispose entire scope |
| **Events** | `on{Update|Change|Release|Error}(...)` | `Cleanup` | Subscribe to events |
| **Introspection** | `entries()` | `[Executor, Accessor][]` | Get all entries |
| | `registeredExecutors()` | `Executor[]` | List executors |
| **Pods** | `pod(options?)` | `Core.Pod` | Create isolated context |
| | `disposePod(pod)` | `Promise<void>` | Clean up pod |
| **Extensions** | `useExtension(ext)` | `Cleanup` | Add extension |

---

## Flow System

### Flow Creation & Execution
```typescript
// Direct flow creation (main function with overloads)
flow<I,S,E>(definition, handler): Core.Executor<NoDependencyHandler<I,S,E>>
flow<I,S,E,D>(definition, dependencies, handler): Core.Executor<DependentHandler<D,I,S,E>>

// Define flow structure (returns Definition with .handler() method)
flow.define<I,S,E>(config: {
  name: string, version?: string,
  input: Schema<I>, success: Schema<S>, error: Schema<E>
}): Flow.Definition<I,S,E>

// Definition.handler() creates executors:
definition.handler(fn): Core.Executor<NoDependencyHandler>
definition.handler(deps, fn): Core.Executor<DependentHandler>

// Execute flows
flow.execute<I,S,E>(flow: Executor, input: I, options?: ExecuteOptions): Promise<OutputLike<S,E>>

// Create extensions
flow.extension(extension: Extension.Extension): Extension.Extension
```

### Flow Context
```typescript
Flow.Context<I,S,E>: DataStore & {
  input: I
  ok(value: S): Flow.OK<S>
  ko(value: E, options?: {cause?}): Flow.KO<E>
  execute(flow, input, opt?): Promise<Flow.Output>
  executeParallel(items, options?): Promise<ParallelResult>
}
```

### Flow Execution Context Accessors
```typescript
FlowExecutionContext.{depth|flowName|parentFlowName|isParallel}: Accessor
FlowExecutionContext.get/set(source: DataStore, value): ExecutionContext
```

---

## Meta System

```typescript
// Create meta
meta<V>(key: string|symbol, schema: Schema<V>): Meta.MetaFn<V>
meta<V>(key, schema, defaultValue: V): Meta.DefaultMetaFn<V>

// MetaFn methods
metaFn(value): Meta<V>                    // Create instance
metaFn.{partial|some|find|get}(source)    // Query operations

// Meta utilities
getValue<V>(meta: Meta<V>): Awaited<V>
findValue<V>(metas, metaFn): V | undefined
findValues<V>(metas, metaFn): V[]
```

---

## Accessor System

```typescript
// Create accessors
accessor<T>(key: string|symbol, schema?: Schema<T>, defaultValue?: T): AccessorSource<T>

// AccessorSource methods
accessor.{get|set|find|preset}(source: DataStore): T

// Core.Accessor interface (returned by scope.accessor)
interface Accessor<T> {
  lookup(): ResolveState<T> | undefined
  get(): T
  resolve(force?): Promise<T>
  release(soft?): Promise<void>
  update(fn): Promise<void>
  set(value): Promise<void>
  subscribe(callback): Cleanup
}
```

---

## Multi-Executor System

```typescript
import * as multi from "@pumped-fn/core-next/multi"

multi.provide<T,K>(factory: (key: K) => T | Promise<T>): Multi.MultiExecutor<T,K>
multi.derive<T,K,D>(deps: D, factory: (deps, key) => T | Promise<T>): Multi.MultiExecutor<T,K>
```

---

## Error System

### Error Classes
```typescript
SchemaError               // Schema validation failed, contains issues[]
ExecutorResolutionError   // Base resolution error with context, code, category
FactoryExecutionError     // Factory function failed
DependencyResolutionError // Dependency resolution failed, may contain missingDependency

// Error creation utilities
createFactoryError(context: ErrorContext): FactoryExecutionError
createDependencyError(context: ErrorContext): DependencyResolutionError
createSystemError(context: ErrorContext): ExecutorResolutionError

// Error codes and messages (via errors namespace)
errors.codes: { FACTORY_EXECUTION_FAILED, DEPENDENCY_NOT_FOUND, ... }
errors.messages: Record<Code, string>
errors.formatErrorMessage(code: Code, params?: Record<string, any>): string
errors.getExecutorName(executor: Core.Executor<unknown>): string
errors.buildDependencyChain(stack: Core.Executor<unknown>[]): string[]
```

---

## Schema Validation

```typescript
custom<T>(): StandardSchemaV1<T, T>                         // Create passthrough schema
// Note: validation happens internally when schemas are used with meta or flow
```

---

## Helper Functions

```typescript
// Resolve multiple executors in parallel
resolves<T>(scope: Scope, executors: T): Promise<InferredOutput<T>>

// Escapable for delayed resolution
type Escapable<T> = { escape: () => Core.Executor<T> }
```

---

## Extension System

```typescript
interface Extension {
  name: string
  // Lifecycle
  init?(scope): void | Promise<void>
  initPod?(pod, context): void | Promise<void>
  dispose?(scope): void | Promise<void>
  disposePod?(pod): void | Promise<void>
  // Wrapping
  wrapResolve?(next, context): Promise<unknown>
  wrapExecute?(context, next, execution): Promise<T>
  // Error handling
  onError?(error, scope): void
  onPodError?(error, pod, context): void
}
```

---

## Core Types

```typescript
// Executor types
Core.Executor<T>           // Main executor
Core.{Lazy|Reactive|Static}<T>  // Variants
Core.Preset<T>             // Preset value
Core.BaseExecutor<T>       // Base type
Core.DependencyLike        // Deps constraint
Core.InferOutput<T>        // Type extraction

// Flow types
Flow.{OK|KO}<T>            // Result types
Flow.OutputLike<S,E>       // OK<S> | KO<E>
Flow.Definition<I,S,E>     // Flow definition
Flow.Context<I,S,E>        // Execution context
Flow.Infer{Input|Success|Error|Output}<F>  // Type extraction

// Schema types
StandardSchemaV1<Input,Output>
StandardSchemaV1.Infer{Input|Output}<S>

// Other core types
Core.Cleanup               // () => void | Promise<void>
Core.Scope                 // Scope instance
Core.Pod                   // Pod instance
Core.Accessor<T>           // Accessor interface
Core.Controller            // Scope controller
Meta.Meta<V>               // Meta instance
Meta.MetaFn<V>             // Meta function
DataStore                  // Map-like storage
Extension.Extension        // Extension interface
```

---

## Imports

```typescript
// Core exports
import { provide, derive, preset, createScope, flow, FlowExecutionContext, accessor, meta, name } from "@pumped-fn/core-next"

// Type guards
import { isExecutor, isMainExecutor, isLazyExecutor, isReactiveExecutor, isStaticExecutor, isPreset } from "@pumped-fn/core-next"

// Utilities
import { custom, resolves, getValue, findValue, findValues } from "@pumped-fn/core-next"

// Error handling
import { SchemaError, ExecutorResolutionError, FactoryExecutionError, DependencyResolutionError } from "@pumped-fn/core-next"
import * as errors from "@pumped-fn/core-next"

// Multi-executor
import * as multi from "@pumped-fn/core-next/multi"

// Types
import type { Core, Flow, Meta, Extension, Multi, StandardSchemaV1, ErrorContext, Accessor, AccessorSource, AccessorWithDefault, DataStore, Escapable } from "@pumped-fn/core-next"
```

---

## Quick Reference

### Common Patterns

| Pattern | APIs | Use Case |
|---------|------|----------|
| **Dependency Injection** | `provide`, `derive`, `preset` | Wire up dependencies |
| **Reactive Updates** | `.reactive`, `scope.update()` | Propagate changes |
| **Lazy Loading** | `.lazy`, `scope.accessor()` | On-demand resolution |
| **Static Caching** | `.static` | Permanent caching |
| **Event Handling** | `scope.on*()` | React to changes |
| **Resource Management** | `scope.release/dispose()` | Cleanup |
| **Context Isolation** | `scope.pod()` | Isolated execution |
| **Parallel Execution** | `ctx.executeParallel()`, `resolves()` | Concurrent operations |

### Primary Use Cases

| Task | Primary APIs |
|------|-------------|
| Create simple executor | `provide()` |
| Create executor with deps | `derive()` |
| Manage application state | `createScope()` |
| Define business flow | `flow.define()`, `flow()` |
| Add metadata | `meta()`, `name` |
| Store context data | `accessor()` |
| Handle errors | Error classes, `ErrorCodes` |
| Extend functionality | `Extension.Extension` |
| Create schemas | `custom()` |
| Create multi-executor | `multi.provide/derive()` |

---

This compressed API reference provides complete coverage for LLM discovery while reducing size by ~60%.