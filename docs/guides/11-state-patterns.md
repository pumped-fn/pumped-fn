---
title: State Patterns
description: In-memory reactive state for sessions, cache, app state
keywords: [state, reactive, session, cache, tokens]
---

# State Patterns

Reactive state for in-memory, scope-bound data. Use for session cache, oauth tokens, app state. State uses same `provide/derive` API as resources but represents ephemeral reactive data rather than external integrations.

## State vs Resource

| Aspect | State | Resource |
|--------|-------|----------|
| **Purpose** | In-memory reactive data | External integrations |
| **Examples** | Session cache, tokens, app state | Database, API client, logger |
| **Lifecycle** | Scope-bound, ephemeral | Connection pooled, persistent |
| **I/O** | None (in-memory) | External (network, disk) |
| **Configuration** | Hardcoded or derived | Tags-based |

**When uncertain:** I/O or tags config → Resource. In-memory reactive → State.

## Basic State Definition

State uses `provide` for initialization and `derive` for controllers.

```ts twoslash
import { provide, derive } from '@pumped-fn/core-next'

// Define state with initial value
const counter = provide(() => 0)

// Derive controller for mutations
const counterCtl = derive(counter.static, (ctl) => ({
  get: () => ctl.get(),
  increment: () => ctl.update(n => n + 1),
  decrement: () => ctl.update(n => n - 1)
}))
```

**File naming:** `state.*.ts` (flat structure with prefix)

## Reactive Consumption

Use `.reactive` property as explicit dependency. When state updates, reactive consumers re-execute.

```ts twoslash
import { flow, provide, derive, createScope } from '@pumped-fn/core-next'

const counter = provide(() => 0)
const counterCtl = derive(counter.static, ctl => ctl)

const displayCounter = flow(
  counter.reactive,
  async (value, ctx) => {
    console.log('Counter:', value)
    return value
  }
)

const scope = createScope()

await scope.exec({ flow: displayCounter }) // logs: Counter: 0

const ctl = await scope.resolve(counterCtl)
ctl.update(n => n + 1)

await scope.exec({ flow: displayCounter }) // logs: Counter: 1
```

**Non-reactive:**
```typescript
// Cached, never re-executes
const display = flow(
  counter,
  async (value, ctx) => value
)
```

**Reactive:**
```typescript
// Re-executes on updates
const display = flow(
  counter.reactive,
  async (value, ctx) => value
)
```

## Static Controllers

Use `.static` property for imperative access and mutations.

```ts twoslash
import { provide, derive } from '@pumped-fn/core-next'

const counter = provide(() => 0)

const counterCtl = derive(counter.static, (ctl) => ({
  get: () => ctl.get(),
  set: (n: number) => ctl.set(n),
  update: (fn: (n: number) => number) => ctl.update(fn),
  subscribe: (fn: (n: number) => void) => ctl.subscribe(fn)
}))
```

**Controller methods:**
- `ctl.get()` - Read current value
- `ctl.set(value)` - Replace value, trigger subscribers
- `ctl.update(fn)` - Functional update, trigger subscribers
- `ctl.subscribe(fn)` - Register change listener

## Lifecycle

State cleanup runs on `scope.dispose()`.

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const sessionCache = provide((controller) => {
  const map = new Map<string, unknown>()

  controller.cleanup(() => {
    console.log('Clearing cache')
    map.clear()
  })

  return map
})

const scope = createScope()
await scope.resolve(sessionCache)
await scope.dispose() // logs: Clearing cache
```

## Composition Patterns

### State Consumed by Resource

```ts twoslash
import { provide, derive } from '@pumped-fn/core-next'

// State: OAuth tokens
const oauthTokens = provide(() => ({
  accessToken: null as string | null,
  refreshToken: null as string | null
}))

const oauthTokensCtl = derive(oauthTokens.static, ctl => ({
  get: () => ctl.get(),
  set: (tokens: { accessToken: string; refreshToken: string }) => ctl.set(tokens)
}))

// Resource: API client depending on token state
const apiClient = derive([oauthTokensCtl], (tokensCtl) => ({
  fetch: async (url: string) => {
    const { accessToken } = tokensCtl.get()
    if (!accessToken) throw new Error('Not authenticated')

    return fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  }
}))
```

### Resource Wrapped by State

```ts twoslash
import { provide, derive } from '@pumped-fn/core-next'

// Resource: Database
const database = provide(() => ({
  query: async (sql: string) => ({ rows: [] })
}))

// State: Query cache wrapping database
const queryCache = derive(database, (db) => {
  const cache = new Map<string, unknown>()

  return {
    query: async <T>(sql: string): Promise<T> => {
      if (cache.has(sql)) return cache.get(sql) as T
      const result = await db.query(sql) as T
      cache.set(sql, result)
      return result
    }
  }
})
```

## Complete Examples

Working implementations demonstrating these patterns:
- Session cache with TTL: `examples/http-server/state.session-cache.ts` + tests
- OAuth tokens + API client: `examples/http-server/state.oauth-tokens.ts`, `resource.api-client.ts`
- Flow orchestration: `examples/http-server/flow.authenticated-request.ts` + tests

## Key Points

- State = in-memory reactive data
- Resource = external integrations
- Same API: `provide/derive` with `.reactive/.static`
- Flow orchestration mandatory (no direct access from entrypoint)
- Cleanup via `controller.cleanup()`
- File naming: `state.*.ts`

## See Also

- [Reactive Patterns](./08-reactive-patterns.md) - `.reactive` mechanics
- [Executors and Dependencies](./01-executors-and-dependencies.md) - `provide/derive` API
- [Flow](./05-flow.md) - Flow explicit dependency patterns
