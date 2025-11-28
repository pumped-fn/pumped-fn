# Migration Guide: @pumped-fn/core-next → @pumped-fn/lite

This guide helps AI agents migrate code from `@pumped-fn/core-next` to `@pumped-fn/lite`.

## Quick Reference

| core-next | lite | Notes |
|-----------|------|-------|
| `provide(factory)` | `atom({ factory })` | No deps |
| `derive(deps, factory)` | `atom({ deps, factory })` | With deps |
| `Core.Executor<T>` | `Lite.Atom<T>` | Type alias |
| `Core.Accessor<T>` | `Lite.Controller<T>` | Renamed + reactive |
| `Core.Controller` | `ResolveContext` | Factory context |
| `scope.accessor(exec)` | `scope.controller(atom)` | Get controller |
| `Promised<T>` | `Promise<T>` | Use native |
| `multi()` | ❌ Not available | Use Map pattern |
| `standardSchema` | ❌ Not available | Validate manually |
| `errors.*` | `Error` | Simple errors |

## Step-by-Step Migration

### 1. Update Imports

```typescript
// BEFORE (core-next)
import {
  provide,
  derive,
  preset,
  createScope,
  flow,
  tag,
  tags,
  resolves,
  extension,
  Promised,
  multi,
  standardSchema,
} from '@pumped-fn/core-next'
import type { Core, Flow, Tag } from '@pumped-fn/core-next'

// AFTER (lite)
import {
  atom,
  preset,
  createScope,
  flow,
  tag,
  tags,
  controller,
} from '@pumped-fn/lite'
import type { Lite } from '@pumped-fn/lite'
```

### 2. Migrate Executors to Atoms

#### Simple Executor (no dependencies)

```typescript
// BEFORE (core-next)
const configExecutor = provide((ctrl) => {
  ctrl.cleanup(() => console.log('cleanup'))
  return { port: 3000 }
})

// AFTER (lite)
const configAtom = atom({
  factory: (ctx) => {
    ctx.cleanup(() => console.log('cleanup'))
    return { port: 3000 }
  }
})
```

#### Executor with Dependencies

```typescript
// BEFORE (core-next)
const serverExecutor = derive(
  { config: configExecutor },
  (ctrl, { config }) => {
    return createServer(config.port)
  }
)

// AFTER (lite)
const serverAtom = atom({
  deps: { config: configAtom },
  factory: (ctx, { config }) => {
    return createServer(config.port)
  }
})
```

#### Lazy/Accessor Dependencies

```typescript
// BEFORE (core-next)
const dbExecutor = derive(
  { config: configExecutor.lazy },
  (ctrl, { config }) => {
    return connectDb(config.get().connectionString)
  }
)

// AFTER (lite)
const dbAtom = atom({
  deps: { config: controller(configAtom) },
  factory: (ctx, { config }) => {
    return connectDb(config.get().connectionString)
  }
})
```

### 3. Migrate Types

```typescript
// BEFORE (core-next)
const myExecutor: Core.Executor<Config> = provide(...)
const myAccessor: Core.Accessor<Config> = scope.accessor(myExecutor)
type MyOutput = Core.InferOutput<typeof myExecutor>

// AFTER (lite)
const myAtom: Lite.Atom<Config> = atom(...)
const myController: Lite.Controller<Config> = scope.controller(myAtom)
```

### 4. Migrate Scope Usage

```typescript
// BEFORE (core-next)
const scope = createScope({
  presets: [preset(configExecutor, mockConfig)],
  extensions: [loggingExtension],
})
const config = await scope.resolve(configExecutor)
const accessor = scope.accessor(configExecutor)

// AFTER (lite)
const scope = await createScope({
  presets: [preset(configAtom, mockConfig)],
  extensions: [loggingExtension],
})
const config = await scope.resolve(configAtom)
const ctrl = scope.controller(configAtom)
```

### 5. Migrate Flows

```typescript
// BEFORE (core-next)
const handleRequest = flow(
  {
    input: requestSchema,  // StandardSchema validation
    output: responseSchema,
    deps: { db: dbExecutor },
    tags: [apiTag('users')],
  },
  async (ctx, input, { db }) => {
    return db.query(input.userId)
  }
)

// Execution
const result = await scope.exec(handleRequest, { userId: '123' })

// AFTER (lite) - No schema validation
const handleRequest = flow({
  deps: { db: dbAtom },
  tags: [apiTag('users')],
  factory: async (ctx, { db }) => {
    const input = ctx.input as RequestInput  // Manual cast
    return db.query(input.userId)
  }
})

// Execution via context
const context = scope.createContext()
const result = await context.exec({
  flow: handleRequest,
  input: { userId: '123' }
})
await context.close()
```

### 6. Migrate Tags

Tags work the same in both packages:

```typescript
// Same in both
const tenantId = tag<string>({ label: 'tenantId' })

const myAtom = atom({
  deps: { tenant: tags.required(tenantId) },
  factory: (ctx, { tenant }) => {
    console.log('Tenant:', tenant)
  }
})
```

### 7. Migrate Extensions

```typescript
// BEFORE (core-next) - Full lifecycle with wrap()
const loggingExt = extension({
  name: 'logging',
  wrap(scope, next, operation) {
    if (operation.kind === 'resolve') {
      console.log('Resolving:', operation.executor)
    }
    return next()
  }
})

// AFTER (lite) - Simplified 4-hook interface
const loggingExt: Lite.Extension = {
  name: 'logging',
  wrapResolve: async (next, atom, scope) => {
    console.log('Resolving atom...')
    const result = await next()
    console.log('Resolved:', result)
    return result
  },
  wrapExec: async (next, target, ctx) => {
    console.log('Executing...')
    return next()
  }
}
```

### 8. Handle Removed Features

#### Multi-Executor Pools

```typescript
// BEFORE (core-next)
const connectionPool = multi.provide({
  key: z.string(),
  factory: (ctrl, key) => createConnection(key)
})
const conn = await scope.resolve(connectionPool('db-primary'))

// AFTER (lite) - Use Map pattern
const connections = new Map<string, Connection>()
const connectionAtom = atom({
  factory: async (ctx) => {
    const key = tags.required(connectionKeyTag).get(ctx.scope)
    if (!connections.has(key)) {
      connections.set(key, createConnection(key))
    }
    return connections.get(key)!
  }
})
```

#### StandardSchema Validation

```typescript
// BEFORE (core-next)
const userFlow = flow({
  input: z.object({ id: z.string() }),  // Auto-validates
  ...
})

// AFTER (lite) - Manual validation
import { z } from 'zod'

const userSchema = z.object({ id: z.string() })

const userFlow = flow({
  factory: async (ctx, deps) => {
    const input = userSchema.parse(ctx.input)  // Manual
    ...
  }
})
```

#### Promised Class

```typescript
// BEFORE (core-next)
const promised = scope.exec(myFlow, input)
promised.finally(() => console.log('done'))
const result = await promised

// AFTER (lite)
const context = scope.createContext()
const result = await context.exec({ flow: myFlow, input })
  .finally(() => console.log('done'))
await context.close()
```

#### resolves() Helper

```typescript
// BEFORE (core-next)
const { config, db, cache } = await resolves(scope, {
  config: configExecutor,
  db: dbExecutor,
  cache: cacheExecutor,
})

// AFTER (lite) - Parallel resolution
const [config, db, cache] = await Promise.all([
  scope.resolve(configAtom),
  scope.resolve(dbAtom),
  scope.resolve(cacheAtom),
])
```

### 9. Migrate Reactivity

Lite has built-in reactivity via Controller that core-next lacks:

```typescript
// lite-only feature: self-invalidation
const configAtom = atom({
  factory: async (ctx) => {
    const config = await fetchConfig()

    const interval = setInterval(() => ctx.invalidate(), 30_000)
    ctx.cleanup(() => clearInterval(interval))

    return config
  }
})

// lite-only: subscribe to changes
const ctrl = scope.controller(configAtom)
ctrl.on(() => {
  console.log('Config changed:', ctrl.get())
})
```

## Migration Checklist

- [ ] Update package.json dependency
- [ ] Change import statements
- [ ] Rename `provide()` → `atom({ factory })`
- [ ] Rename `derive()` → `atom({ deps, factory })`
- [ ] Rename `.lazy` → `controller()`
- [ ] Rename `Core.*` types → `Lite.*` types
- [ ] Rename `scope.accessor()` → `scope.controller()`
- [ ] Update flow execution to use `context.exec()`
- [ ] Add manual validation if using StandardSchema
- [ ] Replace `multi()` with Map-based patterns
- [ ] Replace `Promised` with native Promise
- [ ] Replace `resolves()` with `Promise.all()`
- [ ] Update extension `wrap()` to `wrapResolve()`/`wrapExec()`
- [ ] Run type checker: `pnpm -F @pumped-fn/lite typecheck`
- [ ] Run tests

## When NOT to Migrate

Keep using `@pumped-fn/core-next` if you need:

- StandardSchema validation (automatic flow input/output validation)
- Multi-executor pools (`multi()`)
- Journaling/debugging features
- Rich error hierarchy with context
- O(1) tag lookup (lite uses O(n))
- `Promised` class utilities

## Feature Comparison

| Feature | lite | core-next |
|---------|------|-----------|
| Atoms/Executors | ✅ | ✅ |
| Flows | ✅ | ✅ |
| Tags | ✅ | ✅ |
| Extensions | ✅ (4 hooks) | ✅ (full) |
| Schema validation | ❌ | ✅ |
| Journaling | ❌ | ✅ |
| Multi-executor | ❌ | ✅ |
| Promised class | ❌ | ✅ |
| Rich errors | ❌ | ✅ |
| Controller reactivity | ✅ | ❌ |
| Self-invalidation | ✅ | ❌ |
| Bundle size | <17KB | ~75KB |
| Dependencies | 0 | 0 |
