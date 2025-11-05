# Add State Pattern Implementation Plan

> **IMPORTANT:** This plan was executed and the implementation has been corrected post-review.
> The plan contains outdated `ctx.resource()` API calls - actual implementation uses explicit dependency injection.
> See corrected patterns in skill references and documentation.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add state pattern as conceptual layer for in-memory reactive data, distinct from external integrations (resources).

**Architecture:** State uses same `provide/derive` API as resources but represents ephemeral, scope-bound reactive data (session cache, oauth tokens, app state). Flow orchestration remains mandatory entry point: `entrypoint → flow(deps) → state|resource`.

**Tech Stack:** TypeScript, pumped-fn core, existing skill/docs infrastructure

---

## Task 1: Create state-basic.md Skill Reference

**Files:**
- Create: `.claude/skills/pumped-design/references/state-basic.md`
- Reference: `.claude/skills/pumped-design/references/resource-basic.md` (template structure)
- Reference: `docs/guides/08-reactive-patterns.md` (API examples)

**Step 1: Create state-basic.md with frontmatter and When to Use section**

```markdown
---
name: state-basic
tags: state, add, reactive, lifecycle
description: Define in-memory reactive state using provide/derive. State represents session data, ephemeral cache, app state. Same API as resources but conceptually different - state is internal reactive data, resources are external integrations.
---

# State: Basic Patterns

## When to Use

Use state for in-memory, scope-bound reactive data. Use resources for external integrations.

| Use State | Use Resource |
|-----------|--------------|
| Session cache (in-memory Map) | Database connection |
| OAuth tokens (short/refresh) | API client |
| App state (user preferences) | Logger |
| Form data (ephemeral) | File system |
| Request-scoped cache | Message queue |

**State characteristics:**
- In-memory, scope-bound lifecycle
- Reactive via `.reactive` property
- Controller via `.static` property
- Same `provide/derive` API as resources

**When uncertain:** If it needs I/O or configuration from tags → Resource. If it's in-memory reactive data → State.
```

**Step 2: Add Code Template section**

Add after "When to Use":

```markdown
## Code Template

### File Naming

`state.*.ts` - Flat structure with prefix (follows coding-standards.md)

**Examples:**
- `state.session-cache.ts`
- `state.oauth-tokens.ts`
- `state.user-preferences.ts`

### Basic State Definition

```typescript
import { provide, derive } from '@pumped-fn/core-next'

// Define state with initial value
const counter = provide(() => 0)

// Derive controller for mutations
const counterCtl = derive(counter.static, (ctl) => {
  return {
    get: () => ctl.get(),
    set: (value: number) => ctl.set(value),
    increment: () => ctl.update(n => n + 1),
    decrement: () => ctl.update(n => n - 1)
  }
})
```

### State with Lifecycle

```typescript
import { provide, derive } from '@pumped-fn/core-next'

const cache = provide((controller) => {
  const map = new Map<string, unknown>()

  controller.cleanup(() => {
    console.log('Clearing cache on dispose')
    map.clear()
  })

  return map
})

const cacheCtl = derive(cache.static, (ctl) => {
  return {
    get: <T>(key: string) => ctl.get().get(key) as T | undefined,
    set: <T>(key: string, value: T) => {
      ctl.update(c => {
        c.set(key, value)
        return c
      })
    }
  }
})
```
```

**Step 3: Add Reactive Consumption section**

```markdown
## Reactive Consumption

Use `.reactive` property in flows to mark reactive dependencies. When state updates via `scope.update()` or controller mutations, reactive consumers re-execute.

```typescript
import { flow } from '@pumped-fn/core-next'
import { counter } from './state.counter'

const displayCounter = flow(async (ctx) => {
  const value = await ctx.resource(counter.reactive)
  console.log('Counter:', value)
  return value
})
```

**Non-reactive access:**
```typescript
// First resolution caches, never re-executes
const value = await ctx.resource(counter)
```

**Reactive access:**
```typescript
// Re-executes when counter updates
const value = await ctx.resource(counter.reactive)
```
```

**Step 4: Add Static Controller section**

```markdown
## Static Controller

Use `.static` property to create controllers for imperative mutations.

```typescript
import { derive } from '@pumped-fn/core-next'
import { counter } from './state.counter'

const counterCtl = derive(counter.static, (ctl) => {
  return {
    // Read current value
    get: () => ctl.get(),

    // Replace value
    set: (n: number) => ctl.set(n),

    // Functional update
    update: (fn: (n: number) => number) => ctl.update(fn),

    // Subscribe to changes
    subscribe: (fn: (n: number) => void) => ctl.subscribe(fn)
  }
})
```

**Controller methods:**
- `ctl.get()` - Returns current value
- `ctl.set(value)` - Replaces value, triggers reactive subscribers
- `ctl.update(fn)` - Applies function to current value, triggers subscribers
- `ctl.subscribe(fn)` - Registers callback for value changes

**In flows:**
```typescript
const increment = flow(async (ctx) => {
  const ctl = await ctx.resource(counterCtl)
  ctl.update(n => n + 1)
})
```
```

**Step 5: Add Troubleshooting and Related sections**

```markdown
## Troubleshooting

### Problem: "State not updating reactively"

**Symptom:** Reactive consumer not re-executing on state changes

**Solution:** Ensure using `.reactive` property:
```typescript
// ❌ Wrong - not reactive
const value = await ctx.resource(counter)

// ✅ Correct - reactive
const value = await ctx.resource(counter.reactive)
```

### Problem: "Cannot mutate state from entrypoint"

**Symptom:** Need to update state outside flow

**Solution:** Flows are mandatory orchestration point. Create flow:
```typescript
const updateState = flow(async (ctx, value) => {
  const ctl = await ctx.resource(stateCtl)
  ctl.set(value)
})

await scope.exec(updateState, newValue)
```

### Problem: "Cleanup not running"

**Symptom:** State cleanup not called on dispose

**Solution:** Ensure `controller.cleanup()` registered in provide:
```typescript
const state = provide((controller) => {
  const resource = initialize()
  controller.cleanup(() => resource.dispose())
  return resource
})
```

## Related Sub-skills

- **State: Derived** - State with dependencies (composition)
- **Resource: Basic** - Resources follow same API
- **Flow: Context** - ctx.resource() for state access
- **Coding Standards** - File naming, type safety

## See Also

- [Reactive Patterns Guide](../../../docs/guides/08-reactive-patterns.md)
- [State Patterns Guide](../../../docs/guides/11-state-patterns.md)
```

**Step 6: Verify file structure matches resource-basic.md**

Read `.claude/skills/pumped-design/references/resource-basic.md` and ensure state-basic.md has parallel structure.

**Step 7: Typecheck plan adherence**

Verify no private paths, no machine-specific info.

---

## Task 2: Create state-derived.md Skill Reference

**Files:**
- Create: `.claude/skills/pumped-design/references/state-derived.md`
- Reference: `.claude/skills/pumped-design/references/resource-derived.md`

**Step 1: Create state-derived.md with frontmatter and When to Use**

```markdown
---
name: state-derived
tags: state, add, dependencies, composition
description: Compose state with resources and other state. State can depend on resources (cache wrapping db), other state (layered), and be consumed by resources (api client with token).
---

# State: Derived Patterns

## When to Use

Use derived state when state depends on:
- Resources (cache wrapping database)
- Other state (computed values from multiple states)
- Being consumed by resources (API client with token state)

**Composition patterns:**
1. State → Resource (token state consumed by API client)
2. Resource → State (database wrapped by cache state)
3. State → State (derived computed state)
```

**Step 2: Add Composition Patterns section**

```markdown
## Composition Patterns

### Pattern 1: State Consumed by Resource

Resource depends on state for configuration or data.

```typescript
// state.oauth-tokens.ts
import { provide, derive } from '@pumped-fn/core-next'

export const oauthTokens = provide(() => ({
  accessToken: null as string | null,
  refreshToken: null as string | null,
  expiresAt: null as number | null
}))

export const oauthTokensCtl = derive(oauthTokens.static, (ctl) => ({
  get: () => ctl.get(),
  set: (tokens) => ctl.set(tokens),
  isExpired: () => {
    const { expiresAt } = ctl.get()
    return !expiresAt || Date.now() >= expiresAt
  }
}))

// resource.api-client.ts
import { derive } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'

export const apiClient = derive([oauthTokensCtl], (tokensCtl) => ({
  fetch: async (url: string) => {
    const tokens = tokensCtl.get()
    if (!tokens.accessToken) throw new Error('Not authenticated')

    return fetch(url, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
  }
}))
```

### Pattern 2: Resource Wrapped by State

State provides caching/transformation layer over resource.

```typescript
// resource.database.ts
export const database = provide(() => ({
  query: async (sql: string) => executeQuery(sql)
}))

// state.query-cache.ts
import { derive } from '@pumped-fn/core-next'
import { database } from './resource.database'

export const queryCache = derive([database], (db) => {
  const cache = new Map<string, unknown>()

  return {
    query: async <T>(sql: string): Promise<T> => {
      if (cache.has(sql)) return cache.get(sql) as T

      const result = await db.query(sql) as T
      cache.set(sql, result)
      return result
    },
    invalidate: (sql: string) => cache.delete(sql)
  }
})
```

### Pattern 3: State Depending on State

Derived state computed from other state.

```typescript
// state.cart-items.ts
export const cartItems = provide(() => new Map<string, number>())

// state.cart-total.ts
import { derive } from '@pumped-fn/core-next'
import { cartItems } from './state.cart-items'

export const cartTotal = derive(cartItems.reactive, (items) => {
  let total = 0
  for (const [id, quantity] of items.entries()) {
    total += quantity * getPriceForItem(id)
  }
  return total
})
```
```

**Step 3: Add Data Flow Examples section**

```markdown
## Data Flow Examples

### Example: Authenticated API Request Flow

**Architecture:**
```
entrypoint → flow → state (tokens) → resource (api) → external API
```

**Implementation:**
```typescript
// flow.fetch-user.ts
import { flow } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

export const fetchUser = flow(async (ctx, userId: string) => {
  // Check token state
  const tokensCtl = await ctx.resource(oauthTokensCtl)
  if (tokensCtl.isExpired()) {
    return { success: false as const, reason: 'TOKEN_EXPIRED' as const }
  }

  // Use API client (depends on token state)
  const api = await ctx.resource(apiClient)
  const response = await api.fetch(`/users/${userId}`)

  return { success: true as const, user: response }
})
```

### Example: Cached Database Query Flow

**Architecture:**
```
entrypoint → flow → state (cache) → resource (db) → database
```

**Implementation:**
```typescript
// flow.get-product.ts
import { flow } from '@pumped-fn/core-next'
import { queryCache } from './state.query-cache'

export const getProduct = flow(async (ctx, productId: string) => {
  const cache = await ctx.resource(queryCache)
  const product = await cache.query(`SELECT * FROM products WHERE id = '${productId}'`)
  return product
})
```
```

**Step 4: Add Troubleshooting section**

```markdown
## Troubleshooting

### Problem: "Circular dependency between state and resource"

**Symptom:** State depends on resource which depends on state

**Solution:** Rethink dependency direction. Usually resource should depend on state, not vice versa.

```typescript
// ❌ Circular - don't do this
const state = derive([resource], (r) => r.data)
const resource = derive([state], (s) => makeClient(s))

// ✅ Correct - resource depends on state
const tokenState = provide(() => null)
const apiClient = derive([tokenState.static], (ctl) => makeClient(ctl.get()))
```

### Problem: "Resource not reacting to state changes"

**Symptom:** API client not using updated tokens

**Solution:** Resource derives from state controller, use `.get()` at call time:

```typescript
export const apiClient = derive([oauthTokensCtl], (tokensCtl) => ({
  fetch: async (url: string) => {
    // ✅ Get fresh token every call
    const token = tokensCtl.get().accessToken
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  }
}))
```

## Related Sub-skills

- **State: Basic** - Basic state patterns
- **Resource: Derived** - Parallel patterns for resources
- **Flow: Context** - Orchestration patterns

## See Also

- [State Patterns Guide](../../../docs/guides/11-state-patterns.md)
```

**Step 5: Verify structure consistency**

---

## Task 3: Update coding-standards.md

**Files:**
- Modify: `.claude/skills/pumped-design/references/coding-standards.md:170-184`

**Step 1: Read current file structure section**

Read lines 150-200 to understand current structure.

**Step 2: Update flat structure example to include state**

Replace lines 170-184:

```markdown
### Flat Structure with Prefixes

```
src/
  entrypoint.cli.ts
  entrypoint.web.ts
  entrypoint.test.ts
  flow.order.ts
  flow.payment.ts
  flow.user.ts
  resource.db.ts
  resource.logger.ts
  resource.cache.ts
  state.session.ts
  state.tokens.ts
  util.datetime.ts
  util.validation.ts
  util.crypto.ts
```

**Benefits:**
- Prefix-based alphabetical sorting (all `flow.*` together)
- Shorter import paths: `./flow.order` vs `./flows/order`
- Clear layer membership at a glance
- Easy globbing: `flow.*.ts`, `resource.*.ts`, `state.*.ts`
```

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS (no changes to src, just docs)

---

## Task 4: Update SKILL.md Routing Table

**Files:**
- Modify: `.claude/skills/pumped-design/SKILL.md:8` (activate_when)
- Modify: `.claude/skills/pumped-design/SKILL.md:52-68` (routing table)
- Modify: `.claude/skills/pumped-design/SKILL.md:80-89` (quick reference)

**Step 1: Add state.*.ts to activate_when**

Read lines 1-15, update activate_when (line 8):

```yaml
activate_when:
  - file_pattern: "package.json"
    contains: "@pumped-fn"
  - file_pattern: "**/entrypoint.*.ts"
  - file_pattern: "**/resource.*.ts"
  - file_pattern: "**/flow.*.ts"
  - file_pattern: "**/state.*.ts"
  - directory_exists: "docs/catalog"
```

**Step 2: Add state sub-skills to routing table**

Read lines 50-70, insert after Resource entries (line 57-58):

```markdown
| **State: Basic** | state, add, reactive, lifecycle | Adding state | references/state-basic.md |
| **State: Derived** | state, add, dependencies, composition | State with dependencies | references/state-derived.md |
```

**Step 3: Update quick reference file naming**

Read lines 78-84, update to include state:

```markdown
**File Naming:**
- `entrypoint.*.ts` - Scope creation, env initialization
- `resource.*.ts` - DB, logger, cache (provide/derive)
- `state.*.ts` - Session data, reactive app state (provide/derive)
- `flow.*.ts` - Business workflows (flow())
- `util.*.ts` - Pure functions or executor wrappers
```

**Step 4: Update testing quick reference**

Read lines 85-90, update to include state:

```markdown
**Testing:**
- `util.*` → Unit tests, all edges, preset() for executors
- `flow.*` → Integration tests, ALL branches (Success + Errors)
- `resource.*` → Rarely tested
- `state.*` → Rarely tested (test flows consuming state)
- `entrypoint.*` → Smoke only
```

**Step 5: Verify changes**

Read entire SKILL.md to ensure consistency.

---

## Task 5: Create 11-state-patterns.md Guide

**Files:**
- Create: `docs/guides/11-state-patterns.md`
- Reference: `docs/guides/08-reactive-patterns.md`

**Step 1: Create file with frontmatter and overview**

```markdown
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
```

**Step 2: Add Basic State Definition section**

```markdown
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
```

**Step 3: Add Reactive Consumption section**

```markdown
## Reactive Consumption

Use `.reactive` property to mark reactive dependencies. When state updates, reactive consumers re-execute.

```ts twoslash
import { flow, provide, derive, createScope } from '@pumped-fn/core-next'

const counter = provide(() => 0)
const counterCtl = derive(counter.static, ctl => ctl)

const displayCounter = flow(async (ctx) => {
  const value = await ctx.resource(counter.reactive)
  console.log('Counter:', value)
  return value
})

const scope = createScope()

await scope.exec(displayCounter) // logs: Counter: 0

const ctl = await scope.resolve(counterCtl)
ctl.update(n => n + 1)

await scope.exec(displayCounter) // logs: Counter: 1
```

**Non-reactive:**
```typescript
// Cached, never re-executes
const value = await ctx.resource(counter)
```

**Reactive:**
```typescript
// Re-executes on updates
const value = await ctx.resource(counter.reactive)
```
```

**Step 4: Add Static Controllers section**

```markdown
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
```

**Step 5: Add Lifecycle section**

```markdown
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
```

**Step 6: Add Composition Patterns section**

```markdown
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
const queryCache = derive([database], (db) => {
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
```

**Step 7: Add Complete Example section**

```markdown
## Complete Example

See examples/http-server:
- `state.session-cache.ts` - Session cache with TTL
- `state.oauth-tokens.ts` - OAuth token state
- `resource.api-client.ts` - API client consuming token state
- `flow.authenticated-request.ts` - Flow orchestrating state + resource
```

**Step 8: Add Key Points and See Also sections**

```markdown
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
- [Flow Context](../../../.claude/skills/pumped-design/references/flow-context.md) - `ctx.resource()` usage
```

**Step 9: Verify all code examples typecheck**

Run twoslash validation if available, or manually verify syntax.

---

## Task 6: Update 08-reactive-patterns.md

**Files:**
- Modify: `docs/guides/08-reactive-patterns.md:4` (keywords)
- Modify: `docs/guides/08-reactive-patterns.md:106-110` (see also)

**Step 1: Add state to keywords**

Read lines 1-6, update line 4:

```yaml
keywords: [reactive, updates, scope.update, state]
```

**Step 2: Add link to state patterns guide**

Read lines 104-110, update see also section:

```markdown
## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md)
- [Scope Lifecycle](./03-scope-lifecycle.md)
- [Tags: The Type System](./02-tags-the-type-system.md)
- [State Patterns](./11-state-patterns.md) - In-memory reactive state
```

---

## Task 7: Create state.session-cache.ts Example

**Files:**
- Create: `examples/http-server/state.session-cache.ts`

**Step 1: Write state.session-cache.ts**

```typescript
/**
 * @file state.session-cache.ts
 * Session cache state - ephemeral in-memory storage
 *
 * Demonstrates:
 * - provide() for state initialization
 * - derive().static for controller access
 * - controller.cleanup() for disposal
 * - TTL-based expiration
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { provide, derive } from '@pumped-fn/core-next'

export namespace SessionCache {
  export type Entry<T> = {
    value: T
    expiresAt: number
  }
}

export const sessionCache = provide((controller) => {
  const cache = new Map<string, SessionCache.Entry<unknown>>()

  controller.cleanup(() => {
    cache.clear()
  })

  return cache
})

export const sessionCacheCtl = derive(sessionCache.static, (cacheCtl) => {
  return {
    get: <T>(key: string): T | undefined => {
      const entry = cacheCtl.get().get(key) as SessionCache.Entry<T> | undefined
      if (!entry) return undefined

      if (Date.now() > entry.expiresAt) {
        cacheCtl.update(c => {
          c.delete(key)
          return c
        })
        return undefined
      }

      return entry.value
    },

    set: <T>(key: string, value: T, ttlMs: number): void => {
      cacheCtl.update(c => {
        c.set(key, {
          value,
          expiresAt: Date.now() + ttlMs
        })
        return c
      })
    },

    delete: (key: string): void => {
      cacheCtl.update(c => {
        c.delete(key)
        return c
      })
    },

    clear: (): void => {
      cacheCtl.update(c => {
        c.clear()
        return c
      })
    }
  }
})
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add examples/http-server/state.session-cache.ts
git commit -m "feat(examples): add session cache state example"
```

---

## Task 8: Create state.session-cache.test.ts

**Files:**
- Create: `examples/http-server/state.session-cache.test.ts`

**Step 1: Write failing test structure**

```typescript
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope } from '@pumped-fn/core-next'
import { sessionCacheCtl } from './state.session-cache'

describe('sessionCache', () => {
  it('stores and retrieves values', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    cache.set('key1', 'value1', 60000)
    const result = cache.get<string>('key1')

    assert.equal(result, 'value1')
    await scope.dispose()
  })

  it('expires entries after TTL', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    cache.set('key1', 'value1', 1)
    await new Promise(resolve => setTimeout(resolve, 10))
    const result = cache.get<string>('key1')

    assert.equal(result, undefined)
    await scope.dispose()
  })

  it('deletes specific entries', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    cache.set('key1', 'value1', 60000)
    cache.delete('key1')

    assert.equal(cache.get('key1'), undefined)
    await scope.dispose()
  })

  it('clears all entries', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    cache.set('key1', 'value1', 60000)
    cache.set('key2', 'value2', 60000)
    cache.clear()

    assert.equal(cache.get('key1'), undefined)
    assert.equal(cache.get('key2'), undefined)
    await scope.dispose()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/examples test state.session-cache.test.ts`
Expected: PASS (all 4 tests)

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add examples/http-server/state.session-cache.test.ts
git commit -m "test(examples): add session cache state tests"
```

---

## Task 9: Create state.oauth-tokens.ts Example

**Files:**
- Create: `examples/http-server/state.oauth-tokens.ts`

**Step 1: Write state.oauth-tokens.ts**

```typescript
/**
 * @file state.oauth-tokens.ts
 * OAuth tokens state - session-scoped authentication
 *
 * Demonstrates:
 * - State with structured data
 * - .static controller for mutations
 * - Resource dependency on state
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { provide, derive } from '@pumped-fn/core-next'

export namespace OAuthTokens {
  export type Tokens = {
    accessToken: string | null
    refreshToken: string | null
    expiresAt: number | null
  }
}

const initialTokens: OAuthTokens.Tokens = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null
}

export const oauthTokens = provide(() => initialTokens)

export const oauthTokensCtl = derive(oauthTokens.static, (ctl) => {
  return {
    get: (): OAuthTokens.Tokens => ctl.get(),

    set: (tokens: OAuthTokens.Tokens): void => {
      ctl.set(tokens)
    },

    clear: (): void => {
      ctl.set(initialTokens)
    },

    isExpired: (): boolean => {
      const tokens = ctl.get()
      if (!tokens.expiresAt) return true
      return Date.now() >= tokens.expiresAt
    }
  }
})
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add examples/http-server/state.oauth-tokens.ts
git commit -m "feat(examples): add oauth tokens state example"
```

---

## Task 10: Create resource.api-client.ts Example

**Files:**
- Create: `examples/http-server/resource.api-client.ts`

**Step 1: Write resource.api-client.ts**

```typescript
/**
 * @file resource.api-client.ts
 * API client resource depending on oauth token state
 *
 * Demonstrates:
 * - Resource depending on state
 * - State → Resource composition
 * - .static.get() for imperative access
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { derive } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'

export namespace ApiClient {
  export type Config = {
    baseUrl: string
  }

  export type Response<T> = {
    success: true
    data: T
  } | {
    success: false
    error: string
  }
}

export const apiClient = derive([oauthTokensCtl], (tokensCtl) => {
  const config: ApiClient.Config = {
    baseUrl: process.env.API_BASE_URL || 'https://api.example.com'
  }

  return {
    fetch: async <T>(path: string): Promise<ApiClient.Response<T>> => {
      const tokens = tokensCtl.get()

      if (tokensCtl.isExpired()) {
        return { success: false, error: 'Token expired' }
      }

      if (!tokens.accessToken) {
        return { success: false, error: 'Not authenticated' }
      }

      try {
        const response = await fetch(`${config.baseUrl}${path}`, {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`
          }
        })

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }

        const data = await response.json() as T
        return { success: true, data }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }
})
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add examples/http-server/resource.api-client.ts
git commit -m "feat(examples): add api client resource with state dependency"
```

---

## Task 11: Create flow.authenticated-request.ts Example

**Files:**
- Create: `examples/http-server/flow.authenticated-request.ts`

**Step 1: Write flow.authenticated-request.ts**

```typescript
/**
 * @file flow.authenticated-request.ts
 * Flow orchestrating oauth state and api client resource
 *
 * Demonstrates:
 * - entrypoint → flow → state → resource pattern
 * - Flow as orchestration entry point
 * - Error handling with discriminated unions
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { flow } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

export namespace FetchUser {
  export type Input = {
    userId: string
  }

  export type User = {
    id: string
    name: string
    email: string
  }

  export type Success = {
    success: true
    user: User
  }

  export type Error =
    | { success: false; reason: 'NOT_AUTHENTICATED' }
    | { success: false; reason: 'TOKEN_EXPIRED' }
    | { success: false; reason: 'API_ERROR'; message: string }

  export type Result = Success | Error
}

export const fetchUser = flow(
  async (ctx, input: FetchUser.Input): Promise<FetchUser.Result> => {
    const tokens = await ctx.exec({
      key: 'check-tokens',
      fn: async () => {
        const tokensCtl = await ctx.resource(oauthTokensCtl)
        return tokensCtl.get()
      }
    })

    if (!tokens.accessToken) {
      return { success: false, reason: 'NOT_AUTHENTICATED' }
    }

    const tokensCtl = await ctx.resource(oauthTokensCtl)
    if (tokensCtl.isExpired()) {
      return { success: false, reason: 'TOKEN_EXPIRED' }
    }

    const api = await ctx.resource(apiClient)
    const response = await ctx.exec({
      key: 'fetch-user',
      fn: () => api.fetch<FetchUser.User>(`/users/${input.userId}`)
    })

    if (!response.success) {
      return {
        success: false,
        reason: 'API_ERROR',
        message: response.error
      }
    }

    return { success: true, user: response.data }
  }
)
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add examples/http-server/flow.authenticated-request.ts
git commit -m "feat(examples): add authenticated request flow example"
```

---

## Task 12: Create flow.authenticated-request.test.ts

**Files:**
- Create: `examples/http-server/flow.authenticated-request.test.ts`

**Step 1: Write test for NOT_AUTHENTICATED branch**

```typescript
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope, preset } from '@pumped-fn/core-next'
import { fetchUser } from './flow.authenticated-request'
import { oauthTokensCtl } from './state.oauth-tokens'

describe('fetchUser', () => {
  it('returns NOT_AUTHENTICATED when no token', async () => {
    const scope = createScope()
    const result = await scope.exec(fetchUser, { userId: '123' })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.reason, 'NOT_AUTHENTICATED')
    }

    await scope.dispose()
  })
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test flow.authenticated-request.test.ts`
Expected: PASS (1 test)

**Step 3: Add TOKEN_EXPIRED branch test**

```typescript
  it('returns TOKEN_EXPIRED when token expired', async () => {
    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: Date.now() - 1000
          }),
          set: () => {},
          clear: () => {},
          isExpired: () => true
        })
      ]
    })

    const result = await scope.exec(fetchUser, { userId: '123' })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.reason, 'TOKEN_EXPIRED')
    }

    await scope.dispose()
  })
```

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/examples test flow.authenticated-request.test.ts`
Expected: PASS (2 tests)

**Step 5: Add success branch test**

```typescript
import { apiClient } from './resource.api-client'

  it('returns user when authenticated', async () => {
    const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' }

    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({
            accessToken: 'valid-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 60000
          }),
          set: () => {},
          clear: () => {},
          isExpired: () => false
        }),
        preset(apiClient, {
          fetch: async () => ({ success: true as const, data: mockUser })
        })
      ]
    })

    const result = await scope.exec(fetchUser, { userId: '123' })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.user.id, '123')
      assert.equal(result.user.name, 'Test User')
    }

    await scope.dispose()
  })
```

**Step 6: Add API_ERROR branch test**

```typescript
  it('returns API_ERROR when api fails', async () => {
    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({
            accessToken: 'valid-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 60000
          }),
          set: () => {},
          clear: () => {},
          isExpired: () => false
        }),
        preset(apiClient, {
          fetch: async () => ({ success: false as const, error: 'Network error' })
        })
      ]
    })

    const result = await scope.exec(fetchUser, { userId: '123' })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.reason, 'API_ERROR')
      if (result.reason === 'API_ERROR') {
        assert.equal(result.message, 'Network error')
      }
    }

    await scope.dispose()
  })
```

**Step 7: Run all tests**

Run: `pnpm -F @pumped-fn/examples test flow.authenticated-request.test.ts`
Expected: PASS (4 tests - all branches covered)

**Step 8: Verify typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 9: Commit**

```bash
git add examples/http-server/flow.authenticated-request.test.ts
git commit -m "test(examples): add authenticated request flow tests (all branches)"
```

---

## Task 13: Final Verification

**Files:**
- All modified/created files

**Step 1: Run full typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/examples typecheck
```

Expected: All PASS with zero errors

**Step 2: Run all example tests**

```bash
pnpm -F @pumped-fn/examples test
```

Expected: All PASS

**Step 3: Verify no private paths in documentation**

```bash
grep -r "/home/" .claude/skills/pumped-design/references/state-*.md docs/guides/11-state-patterns.md
```

Expected: No matches (exit code 1)

**Step 4: Verify cross-references**

Read files to verify:
- SKILL.md includes state in routing table
- coding-standards.md includes state.*.ts
- 11-state-patterns.md links to 08-reactive-patterns.md
- 08-reactive-patterns.md links to 11-state-patterns.md
- state-basic.md links to related sub-skills

**Step 5: Verify git status**

```bash
git status
```

Expected to show:
- 11 new files (2 skills + 1 guide + 6 examples + 2 tests)
- 3 modified files (SKILL.md, coding-standards.md, reactive-patterns.md)

**Step 6: Create summary commit**

```bash
git add .
git commit -m "docs: add state pattern to pumped-fn architecture

- Add state-basic.md and state-derived.md skill references
- Add 11-state-patterns.md guide
- Update SKILL.md routing table and activation
- Update coding-standards.md file structure
- Add session-cache, oauth-tokens, api-client examples
- Add authenticated-request flow with full test coverage
- Link state patterns to reactive patterns guide"
```

---

## Success Criteria

- [ ] All typechecks pass (src + tests + examples)
- [ ] All example tests pass (4 tests in flow.authenticated-request.test.ts, 4 in session-cache.test.ts)
- [ ] Skills route correctly to state sub-skills (state-basic, state-derived)
- [ ] Docs link correctly (11 ↔ 08)
- [ ] Examples demonstrate:
  - Basic state (session cache)
  - State lifecycle (cleanup)
  - State consumed by resource (api client + token)
  - Flow orchestrating state + resource
- [ ] Coding standards include state.*.ts
- [ ] SKILL.md activation includes state.*.ts pattern
- [ ] No private/machine-specific paths in any documentation
- [ ] All commits follow conventional commit format

---

## Execution Options

**Plan complete and saved to `plans/2025-11-04-add-state-pattern.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration. Use superpowers:subagent-driven-development.

**2. Parallel Session (separate)** - Open new session with /superpowers:execute-plan, batch execution with checkpoints.

**Which approach?**
