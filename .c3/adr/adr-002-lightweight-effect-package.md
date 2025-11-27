---
id: ADR-002-lightweight-effect-package
title: Lightweight Effect Package (@pumped-fn/effect)
summary: >
  Create a minimal DI/effect package as an alternative to core-next, focusing on
  zero-dependency simplicity with a reduced API surface for lightweight applications.
status: accepted
date: 2025-11-27
---

# [ADR-002] Lightweight Effect Package (@pumped-fn/effect)

## Status {#adr-002-status}
**Accepted** - 2025-11-27

## Problem/Requirement {#adr-002-problem}

`@pumped-fn/core-next` provides a comprehensive effect system with rich features:
- Schema validation (StandardSchema)
- Journaling for debugging
- Reactive patterns (multi-executor pools)
- Enhanced Promise (Promised class)
- Detailed error hierarchy with context

However, many use cases require only core DI functionality:
- Lightweight applications where bundle size matters
- Server-side scripts with simple dependency graphs
- Projects that want DI patterns without the full ecosystem
- Learning/prototyping where simplicity aids understanding

**Requirements for a lightweight alternative:**
1. Zero external dependencies
2. Minimal API surface (atom, flow, tag, scope)
3. Full TypeScript type inference for dependencies
4. Same conceptual model as core-next for migration path
5. Sub-10KB bundle size target

## Exploration Journey {#adr-002-exploration}

**Initial hypothesis:** Fork core-next and strip features.

**Explored:**

- **Core concepts that must remain:**
  - `atom` - Long-lived dependency with lifecycle
  - `flow` - Short-lived execution with input
  - `tag` - Metadata attachment/extraction
  - `scope` - Container with resolution caching
  - `extension` - Cross-cutting behavior hooks

- **Features that can be removed:**
  - Schema validation → Users validate manually if needed
  - Journaling → Debug via extensions if needed
  - Multi-executor → Use plain atoms with Map-based keys
  - Promised class → Use native Promise
  - Rich error hierarchy → Simple Error with messages

- **Type system challenges discovered:**
  - `TagExecutor<TOutput, TTag>` variance issues when stored in dependency records
  - Overload selection for `atom()` / `flow()` with optional deps
  - Inference of dependency types through `InferDeps<D>`

**Solutions implemented:**

1. **Two-parameter TagExecutor**: `TagExecutor<TOutput, TTag>` where TOutput differs from TTag for optional/all modes
2. **Structural constraint for deps**: Use `{ mode: string }` instead of `TagExecutor<unknown>` to avoid variance issues
3. **Overload with `deps?: undefined`**: First overload explicitly marks no-deps case for proper discrimination
4. **`const` type parameter**: Preserves literal types in dependency records

## Solution {#adr-002-solution}

Create `@pumped-fn/effect` as a new package with:

### Core API

```typescript
import { atom, flow, tag, tags, lazy, preset, createScope } from '@pumped-fn/effect'
import type { Lite } from '@pumped-fn/effect'

const configAtom = atom({
  factory: () => ({ port: 3000 })
})

const serverAtom = atom({
  deps: { config: configAtom },
  factory: (ctx, { config }) => createServer(config.port)
})

const tenantId = tag<string>({ label: 'tenantId' })

const handleRequest = flow({
  deps: {
    server: serverAtom,
    tenant: tags.required(tenantId)
  },
  factory: (ctx, { server, tenant }) => {
    return server.handle(ctx.input, tenant)
  }
})

const scope = await createScope({
  tags: [tenantId('tenant-123')],
  presets: [preset(configAtom, { port: 8080 })],
  extensions: [loggingExtension]
})

const ctx = scope.createContext()
const result = await ctx.exec({ flow: handleRequest, input: request })
await ctx.close()
```

### Type System

**Tag Executor with dual type parameters:**
```typescript
interface TagExecutor<TOutput, TTag = TOutput> {
  readonly tag: Tag<TTag, boolean>
  readonly mode: "required" | "optional" | "all"
}

const tags = {
  required<T>(tag): TagExecutor<T, T>
  optional<T>(tag): TagExecutor<T | undefined, T>
  all<T>(tag): TagExecutor<T[], T>
}
```

**Dependency inference:**
```typescript
type InferDep<D> = D extends Atom<infer T>
  ? T
  : D extends Lazy<infer T>
    ? Accessor<T>
    : D extends TagExecutor<infer TOutput, infer _TTag>
      ? TOutput
      : never

type InferDeps<D> = { [K in keyof D]: InferDep<D[K]> }
```

**Overload pattern for factory inference:**
```typescript
function atom<T>(config: {
  deps?: undefined
  factory: (ctx: ResolveContext) => MaybePromise<T>
}): Atom<T>

function atom<
  T,
  const D extends Record<string, Atom<unknown> | Lazy<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: ResolveContext, deps: InferDeps<D>) => MaybePromise<T>
}): Atom<T>
```

### Extension System

Simplified extension interface with three hooks:
```typescript
interface Extension {
  readonly name: string
  init?(scope: Scope): MaybePromise<void>
  wrapResolve?<T>(
    next: () => Promise<T>,
    atom: Atom<T>,
    scope: Scope
  ): Promise<T>
  wrapExec?<T>(
    next: () => Promise<T>,
    target: Flow<T, unknown> | Function,
    ctx: ExecutionContext
  ): Promise<T>
  dispose?(scope: Scope): MaybePromise<void>
}
```

### ExecutionContext

Simplified context without journaling:
```typescript
interface ExecutionContext {
  readonly input: unknown
  readonly scope: Scope
  exec<T>(options: ExecFlowOptions<T>): Promise<T>
  exec<T, Args>(options: ExecFnOptions<T, Args>): Promise<T>
  onClose(fn: () => MaybePromise<void>): void
  close(): Promise<void>
}
```

### Source Organization

```
packages/effect/
├── src/
│   ├── index.ts      # Public exports
│   ├── types.ts      # Lite namespace with all interfaces
│   ├── symbols.ts    # Unique symbols for type guards
│   ├── atom.ts       # atom(), lazy(), isAtom(), isLazy()
│   ├── flow.ts       # flow(), isFlow()
│   ├── tag.ts        # tag(), tags, isTag(), isTagged()
│   ├── preset.ts     # preset(), isPreset()
│   └── scope.ts      # createScope(), Scope, ExecutionContext
└── tests/
    ├── atom.test.ts
    ├── flow.test.ts
    ├── tag.test.ts
    ├── scope.test.ts
    └── extension.test.ts
```

## Changes Across Layers {#adr-002-changes}

### Context Level (c3-0)

Update README.md Containers table to include:

| Container | Type | Description | Documentation |
|-----------|------|-------------|---------------|
| @pumped-fn/effect | Library | Lightweight effect system - minimal DI with atoms, flows, tags | c3-2-effect |

### Container Level

Create new container documentation: `c3-2-effect/` (future work if package grows)

For now, the package is simple enough that this ADR serves as primary documentation.

### Component Level

No changes to core-next components. Effect package is independent.

## Comparison with core-next {#adr-002-comparison}

| Feature | @pumped-fn/core-next | @pumped-fn/effect |
|---------|---------------------|-------------------|
| Atom/Flow/Tag | Yes | Yes |
| Extension hooks | Full (resolve, exec, lifecycle) | Simplified (resolve, exec) |
| Schema validation | StandardSchema | No |
| Journaling | Yes | No |
| Multi-executor | Yes | No |
| Promised class | Yes | No (native Promise) |
| Error classes | Rich hierarchy | Simple Error |
| Type inference | Yes | Yes |
| Bundle size | ~25KB | <10KB target |
| Dependencies | 0 | 0 |

## Migration Path {#adr-002-migration}

**From effect to core-next:**
1. Change import `@pumped-fn/effect` → `@pumped-fn/core-next`
2. Rename `Lite` namespace → specific imports
3. Add schema validation if desired
4. No API changes needed for basic usage

**Types are intentionally compatible:**
- `Lite.Atom<T>` same shape as core-next `Executor<T>`
- `Lite.Flow<T, I>` same shape as core-next `Flow<T, I>`
- `Lite.Tag<T>` same shape as core-next `Tag<T>`

## Verification {#adr-002-verification}

### Type System
- [x] `atom()` without deps infers factory with only ctx parameter
- [x] `atom()` with deps infers deps types correctly
- [x] `flow()` matches atom pattern
- [x] `tags.required(t)` returns `TagExecutor<T, T>`
- [x] `tags.optional(t)` returns `TagExecutor<T | undefined, T>`
- [x] `tags.all(t)` returns `TagExecutor<T[], T>`
- [x] `InferDeps` correctly resolves mixed atom/tag/lazy dependencies

### Runtime Behavior
- [x] Atom resolution caches values
- [x] Circular dependency detection
- [x] Cleanup runs in LIFO order
- [x] Preset values override factories
- [x] Preset atoms redirect resolution
- [x] Tags merge (exec > context > scope > flow)
- [x] Extensions wrap in correct order
- [x] Context cleanup on close

### Test Coverage
- [x] 72 tests passing
- [x] Typecheck passes for src and tests

## Future Considerations {#adr-002-future}

### C3 Documentation
If the package grows significantly, create full container documentation at `c3-2-effect/`.

### Feature Requests
Keep effect minimal. Features that require significant complexity belong in core-next.

### Shared Types Package
Consider `@pumped-fn/types` if type sharing between packages becomes valuable.

## Alternatives Considered {#adr-002-alternatives}

### 1. Build flag to strip features from core-next

**Rejected:** Would complicate core-next build and maintenance. Separate packages are cleaner.

### 2. Re-export subset from core-next

**Rejected:** Doesn't achieve bundle size goal since core-next internals are interconnected.

### 3. Single package with optional peer dependencies

**Rejected:** Adds complexity for users. Two packages with clear purposes is simpler.

## Related {#adr-002-related}

- [c3-0](../README.md) - System overview (update Containers table)
- [c3-1](../c3-1-core/) - Core library documentation (reference implementation)
- [ADR-001](./adr-001-execution-context-lifecycle.md) - ExecutionContext lifecycle (concept carried to effect)
