# Migration Guide: @pumped-fn/core-next → @pumped-fn/lite

This guide helps AI agents migrate code from `@pumped-fn/core-next` to `@pumped-fn/lite`.

## Next major: CLI removal

The next major version removes the text-only `pumped-lite` CLI from `@pumped-fn/lite`. The package
no longer installs a `pumped-lite` bin or supports the previous `npx @pumped-fn/lite` commands. Read
the package documentation directly instead.

## Quick Reference

| core-next | lite | Notes |
|-----------|------|-------|
| `provide(factory)` | `atom({ factory })` | No deps |
| `derive(deps, factory)` | `atom({ deps, factory })` | With deps |
| `Core.Executor<T>` | `Lite.Atom<T>` | Type alias |
| `Core.Accessor<T>` | `Lite.Controller<T>` | Renamed + reactive |
| `Core.Controller` | `ResolveContext` | Factory context |
| `scope.accessor(exec)` | `scope.controller(atom)` | Get controller |
| `accessor.on(fn)` | `ctrl.on(event, fn)` | Event filtering: `'resolved'`, `'resolving'`, `'*'` |
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
const config = atom({
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
const server = atom({
  deps: { config },
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
const db = atom({
  deps: { config: controller(config, { resolve: true }) },
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
const config: Lite.Atom<Config> = atom(...)
const ctrl: Lite.Controller<Config> = scope.controller(config)
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
const scope = createScope({
  presets: [preset(config, mockConfig)],
  extensions: [loggingExtension],
})
const cfg = await scope.resolve(config)
const ctrl = scope.controller(config)
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

// AFTER (lite) - Optional parse validation
const api = tag<string>({ label: "api" })

const handleRequest = flow({
  name: 'handleRequest',
  deps: { db },
  tags: [api('users')],
  parse: (raw) => {
    const obj = raw as Record<string, unknown>
    if (typeof obj.userId !== 'string') throw new Error('userId required')
    return { userId: obj.userId }
  },
  factory: async (ctx, { db }) => {
    // ctx.input is typed as { userId: string }
    return db.query(ctx.input.userId)
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

Tags work the same in both packages, with lite adding optional `parse` for validation:

```typescript
// Same in both
const tenantId = tag<string>({ label: 'tenantId' })

// lite-only: tag with parse validation
const userId = tag({
  label: 'userId',
  parse: (raw) => {
    if (typeof raw !== 'string') throw new Error('Must be string')
    if (raw.length < 1) throw new Error('Cannot be empty')
    return raw
  }
})

userId('abc-123')  // OK - returns Tagged<string>
userId(123)        // Throws ParseError

const audit = atom({
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
  wrapResolve: async (next, event) => {
    console.log('Resolving:', event.kind, event.target)
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

// AFTER (lite) - per-scope atom keyed by tag
const connectionKey = tag<string>({ label: "connectionKey" })

const connection = atom({
  deps: { key: tags.required(connectionKey) },
  factory: (ctx, { key }): Connection => {
    const conn = createConnection(key)
    ctx.cleanup(() => conn.close())
    return conn
  },
})
```

#### StandardSchema Validation

```typescript
// BEFORE (core-next)
const userFlow = flow({
  input: z.object({ id: z.string() }),  // Auto-validates
  ...
})

// AFTER (lite) - Use parse function
import { z } from 'zod'

const userSchema = z.object({ id: z.string() })

const getUser = flow({
  name: 'getUser',
  parse: (raw) => userSchema.parse(raw),  // Validates before factory
  factory: async (ctx) => {
    // ctx.input is typed as { id: string }
    return ctx.input.id
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
const result = await context.exec({ flow: process, input })
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
const [cfg, pool, store] = await Promise.all([
  scope.resolve(config),
  scope.resolve(db),
  scope.resolve(cache),
])
```

### 9. Migrate Reactivity

Lite has built-in reactivity via Controller that core-next lacks:

```typescript
// lite-only feature: self-invalidation
const config = atom({
  factory: async (ctx) => {
    const config = await fetchConfig()

    const interval = setInterval(() => ctx.invalidate(), 30_000)
    ctx.cleanup(() => clearInterval(interval))

    return config
  }
})

// lite-only: subscribe to changes with state filtering
const ctrl = scope.controller(config)

// Subscribe to specific events
ctrl.on('resolved', () => {
  console.log('Config resolved:', ctrl.get())
})

ctrl.on('resolving', () => {
  console.log('Config is re-resolving...')
})

// Subscribe to all state changes
ctrl.on('*', () => {
  console.log('Config state changed:', ctrl.state)
})

// Fine-grained subscriptions with select()
// atom must be resolved first — select() throws on unresolved atom
await scope.resolve(config)
const portSelect = scope.select(config, (config) => config.port)
portSelect.subscribe(() => {
  console.log('Port changed:', portSelect.get())
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
- [ ] Audit long-lived atoms for GC exposure: lite GC is enabled by default (`graceMs: 3000`). GC triggers when the last subscriber (from `ctrl.on`, `select.subscribe`) unsubscribes or the last dependent atom is released — **not** on bare `scope.resolve`. core-next had no GC. Any infra atom that React hooks, `select`, or `watch` ever subscribe to should be declared with `keepAlive: true` to prevent unexpected release and re-initialization.
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
| Fine-grained select() | ✅ | ❌ |
| Tag/Flow parse functions | ✅ | ❌ |
| Bundle size | <17KB | ~75KB |
| Dependencies | 0 | 0 |
