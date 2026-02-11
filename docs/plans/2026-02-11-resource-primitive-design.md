# Resource — Execution-Scoped Dependency Primitive

## Problem

Reusable, lifecycle-managed instances (logger, transaction, trace span) belong at the execution level — not the scope. Today the workaround is manual tag wiring:

```typescript
const loggerTag = tag<Logger>({ label: "logger" })

// wire manually at exec time
ctx.data.setTag(loggerTag, new RequestLogger(requestId))

// consume manually in flow
const logger = ctx.data.seekTag(loggerTag)
```

This works but lacks: factory-based creation, dependency resolution, automatic cleanup, and reusability as a declared dependency.

## Solution

New primitive: `resource({ deps, factory })`.

- Factory receives `ExecutionContext` + resolved deps
- Fresh instance on first encounter in execution chain
- Seek-up on nested execs (shared within chain, not across chains)
- Cleanup via `ctx.onClose(result)` — automatic, lifecycle-bound
- Declared in flow `deps` alongside atoms and tags

## Diagram

https://diashort.apps.quickable.co/d/46341c5f/resource

## Golden Example

```typescript
const requestLogger = resource({
  deps: { logService: logServiceAtom, requestId: tags.required(requestIdTag) },
  factory: (ctx, { logService, requestId }) => {
    const logger = logService.child({ requestId })
    ctx.onClose((result) => {
      if (!result.ok) logger.error(result.error)
      logger.flush()
    })
    return logger
  }
})

const transaction = resource({
  deps: { db: dbAtom },
  factory: (ctx, { db }) => {
    const tx = db.beginTransaction()
    ctx.onClose((result) => result.ok ? tx.commit() : tx.rollback())
    return tx
  }
})

const createOrder = flow({
  deps: { logger: requestLogger, tx: transaction },
  factory: async (ctx, { logger, tx }) => {
    logger.info("creating order", ctx.input)
    const order = await tx.insert("orders", ctx.input)
    await ctx.exec({ flow: notifyWarehouse, input: order })
    return order
  }
})

const notifyWarehouse = flow({
  deps: { logger: requestLogger, tx: transaction },
  factory: async (ctx, { logger, tx }) => {
    logger.info("notifying warehouse")
    await tx.insert("notifications", { type: "warehouse", order: ctx.input })
  }
})

// --- usage ---
const ctx = scope.createContext({ tags: [requestIdTag("req-abc")] })
await ctx.exec({ flow: createOrder, input: { item: "widget", qty: 2 } })
// Logger#1 shared across createOrder + notifyWarehouse
// Tx#1 shared across both — commits once on success, rollbacks on any failure
```

## Resolution Behavior

| Dep type | Resolution strategy |
|----------|-------------------|
| `Atom<T>` | Scope cache (singleton) |
| `TagExecutor<T>` | Seek context hierarchy |
| `Resource<T>` | Seek context hierarchy, `factory(ctx, deps)` on miss |
| `ControllerDep<T>` | Scope controller |

### Resolution Order

Consistent with atom resolution — each dep type resolves through its own hook, all before `wrapExec`:

```
ctx.exec({ flow: createOrder })
│
├── 1. create childCtx
├── 2. atom deps     → wrapResolve({ kind: "atom" })
├── 3. tag deps      → seek hierarchy
├── 4. resource deps → wrapResolve({ kind: "resource" })
├── 5. wrapExec(next, flow, childCtx)  ← all deps ready
│      └── next() → flow.factory(childCtx, allDeps)
└── 6. childCtx.close(result)
```

`wrapResolve` and `wrapExec` are independent hooks. Resource resolution completes before `wrapExec` fires, same pattern as atoms.

### Seek-Up Within Execution Chain

Resource instances are stored on the context that first resolved them. Nested and sibling execs seek up to the parent:

```
root ctx
  └── exec(createOrder)          ← resource factory runs → Logger#1, Tx#1
        ├── exec(notifyWarehouse)    ← seeks up to parent, finds Logger#1, Tx#1 ✓
        └── exec(processPayment)     ← seeks up to parent, finds Logger#1, Tx#1 ✓
```

Sibling execs share resources via the parent context — the resource lives on the parent, not on the first sibling that triggered resolution. This means a single transaction spans all sibling execs under the same parent.

No scope-level caching. Instance lives and dies with the creating context's `close()`.

## Dep Validity

Resources can only appear as deps in **flows** and **other resources**. Not in atoms.

| Consumer | Can depend on Resource? | Reason |
|----------|------------------------|--------|
| `flow` | yes | has ExecutionContext |
| `resource` | yes | has ExecutionContext |
| `atom` | **no** | scope-level, no ExecutionContext |

### Resource-to-Resource Dependencies

Resources can depend on other resources. Resolved in dependency order within the execution context. Cycle detection uses the same mechanism as atom-to-atom deps.

```typescript
const traceSpan = resource({
  deps: { traceId: tags.required(traceIdTag) },
  factory: (ctx, { traceId }) => startSpan(traceId)
})

const requestLogger = resource({
  deps: { span: traceSpan },
  factory: (ctx, { span }) => new Logger(span)
})
```

## Cleanup Failure Behavior

Resource cleanup runs via `ctx.onClose(result)`. If a cleanup function throws, the error escalates to the top-level ExecutionContext — same as existing `onClose` behavior. The original `CloseResult` is not masked; the cleanup error surfaces separately.

## Type Changes

### Dependency union — add Resource

```typescript
type Dependency =
  | Atom<unknown>
  | ControllerDep<unknown>
  | TagExecutor<any>
  | Resource<unknown>
```

### InferDep — add Resource branch

```typescript
type InferDep<D> = D extends Atom<infer T>
  ? T
  : D extends ControllerDep<infer T>
    ? Controller<T>
    : D extends TagExecutor<infer TOutput, infer _TTag>
      ? TOutput
      : D extends Resource<infer T>
        ? T
        : never
```

### isResource type guard

```typescript
function isResource(value: unknown): value is Resource<unknown>
```

Runtime symbol marker on resource instances, consistent with `isAtom`, `isFlow`.

### Flow deps constraint

Flow factory overloads updated to accept `Resource<T>` in the deps record. Atom factory overloads explicitly exclude it (compile error if attempted).

## Extension Changes (Breaking)

### ResolveEvent — discriminated union

`wrapResolve` signature changes from `(next, atom, scope)` to `(next, event)`.

```typescript
/**
 * Discriminated context for `wrapResolve`.
 *
 * - `"atom"` — scope-level singleton. Cached after first resolve.
 * - `"resource"` — execution-level. Fresh factory per first encounter,
 *   seek-up on nested execs within the same chain.
 */
type ResolveEvent =
  | {
      /** Scope-level resolution — cached singleton */
      readonly kind: "atom"
      readonly target: Atom<unknown>
      readonly scope: Scope
    }
  | {
      /** Execution-level resolution — fresh per chain, seek-up on nested */
      readonly kind: "resource"
      readonly target: Resource<unknown>
      readonly ctx: ExecutionContext
    }
```

### Updated Extension interface

```typescript
export interface Extension {
  readonly name: string
  init?(scope: Scope): MaybePromise<void>
  /**
   * Wraps dependency resolution. Dispatch by `event.kind`:
   *
   * - `"atom"` — `event.scope`, `event.target: Atom`. Cached in scope.
   * - `"resource"` — `event.ctx`, `event.target: Resource`. Seek-up in
   *   execution hierarchy, factory(ctx, deps) on miss.
   */
  wrapResolve?(
    next: () => Promise<unknown>,
    event: ResolveEvent
  ): Promise<unknown>
  wrapExec?(
    next: () => Promise<unknown>,
    target: ExecTarget,
    ctx: ExecutionContext
  ): Promise<unknown>
  dispose?(scope: Scope): MaybePromise<void>
}
```

### Migration

Breaking change to `wrapResolve` signature. Affected:
- `lite-devtools` extension
- Extension tests
- Any user-authored extensions

Migration: update `(next, atom, scope)` → `(next, event)`, switch on `event.kind`.

## Decisions

| Aspect | Decision |
|--------|----------|
| Name | `resource` |
| Factory param | `(ctx: ExecutionContext, deps) => T` |
| Dep consumers | flows and resources only (not atoms) |
| Dep types | atoms, tags, other resources |
| Cycle detection | same mechanism as atom-to-atom |
| Sharing | seek-up within execution chain, stored on parent |
| Multi-instance | not in v1 |
| Cleanup | `ctx.onClose(result)` at creating level |
| Cleanup failure | escalates to top-level ExecutionContext |
| Consumer API | same `deps` bag as atoms/tags |
| Resolution order | before `wrapExec`, through `wrapResolve` independently |
| Extension hook | reuse `wrapResolve` with `ResolveEvent` discriminated union |
| Type guard | `isResource()` with runtime symbol |
| Breaking change | `wrapResolve` signature |

## Not in v1

- `resource({ shared: false })` — fresh instance per exec level
- Preset support for resources (swap resource implementation)
- Resource-specific GC or eviction
