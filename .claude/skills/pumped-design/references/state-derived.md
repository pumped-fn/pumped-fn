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

---

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

---

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

---

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

---

## Related Sub-skills

- **State: Basic** - Basic state patterns
- **Resource: Derived** - Parallel patterns for resources
- **Flow: Context** - Orchestration patterns

## See Also

- [State Patterns Guide](../../../docs/guides/11-state-patterns.md)
