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

export const apiClient = derive(oauthTokensCtl, (tokensCtl) => ({
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

export const queryCache = derive(database, (db) => {
  const cache = new Map<string, unknown>()

  return {
    query: async <T>(params: { sql: string; params?: unknown[] }): Promise<T> => {
      const cacheKey = JSON.stringify(params)
      if (cache.has(cacheKey)) return cache.get(cacheKey) as T

      const result = await db.query(params.sql) as T
      cache.set(cacheKey, result)
      return result
    },
    invalidate: (params: { sql: string; params?: unknown[] }) =>
      cache.delete(JSON.stringify(params))
  }
})
```

### Pattern 3: State Depending on State

Derived state computed from other state.

```typescript
// state.cart-items.ts
export const cartItems = provide(() => new Map<string, number>())

// state.product-prices.ts
export const productPrices = provide(() => new Map<string, number>([
  ['item-1', 10.99],
  ['item-2', 25.50],
  ['item-3', 5.00]
]))

// state.cart-total.ts
import { derive } from '@pumped-fn/core-next'
import { cartItems } from './state.cart-items'
import { productPrices } from './state.product-prices'

export const cartTotal = derive(
  [cartItems.reactive, productPrices.reactive] as const,
  ([items, prices]) => {
    let total = 0
    for (const [id, quantity] of items.entries()) {
      const price = prices.get(id) ?? 0
      total += quantity * price
    }
    return total
  }
)
```

---

## Type Safety

### Inferring Types from Dependencies

Type safety is automatic when deriving from properly typed dependencies:

```typescript
// State with explicit type
export const userState = provide(() => ({
  id: '',
  name: '',
  email: ''
}))

// Type is inferred: StateController<{ id: string; name: string; email: string }>
export const userCtl = derive(userState.static, (ctl) => ctl)

// Derived state automatically typed
export const userName = derive(userState.reactive, (user) => {
  // user is { id: string; name: string; email: string }
  return user.name.toUpperCase()
})
```

### Multiple Dependency Types

When deriving from multiple dependencies, all types are inferred:

```typescript
export const cartTotal = derive(
  [cartItems.reactive, productPrices.reactive],
  (items, prices) => {
    // items: Map<string, number>
    // prices: Map<string, number>
    let total = 0
    for (const [id, quantity] of items.entries()) {
      const price = prices.get(id) ?? 0
      total += quantity * price
    }
    return total
  }
)
// cartTotal type: number (inferred from return)
```

### Resource with State Dependencies

Resources consuming state maintain full type safety:

```typescript
export const apiClient = derive([oauthTokensCtl], (tokensCtl) => ({
  fetch: async (url: string) => {
    // tokensCtl.get() returns { accessToken: string | null, ... }
    const tokens = tokensCtl.get()
    if (!tokens.accessToken) throw new Error('Not authenticated')

    return fetch(url, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
  }
}))
// apiClient.fetch is async (url: string) => Promise<Response>
```

### Type Guards for Runtime Safety

Combine TypeScript type guards with state validation:

```typescript
namespace Auth {
  export type Authenticated = {
    state: 'authenticated'
    token: string
    expiresAt: number
  }

  export type Unauthenticated = {
    state: 'unauthenticated'
  }

  export type State = Authenticated | Unauthenticated

  export const isAuthenticated = (s: State): s is Authenticated =>
    s.state === 'authenticated'
}

export const authState = provide((): Auth.State => ({
  state: 'unauthenticated'
}))

export const apiClient = derive([authState.static], (authCtl) => ({
  fetch: async (url: string) => {
    const auth = authCtl.get()
    if (!Auth.isAuthenticated(auth)) {
      throw new Error('Not authenticated')
    }

    // auth is now Authenticated type
    return fetch(url, {
      headers: { Authorization: `Bearer ${auth.token}` }
    })
  }
}))
```

---

## Data Flow Examples

### Example: Authenticated API Request Flow

**Architecture:**
```
entrypoint → flow(deps: [state, resource]) → state (tokens) → resource (api) → external API
```

**Implementation:**
```typescript
// flow.fetch-user.ts
import { flow } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

export const fetchUser = flow(
  [oauthTokensCtl, apiClient] as const,
  async ([tokensCtl, api], ctx, userId: string) => {
    if (tokensCtl.isExpired()) {
      return { success: false as const, reason: 'TOKEN_EXPIRED' as const }
    }

    const response = await api.fetch(`/users/${userId}`)
    return { success: true as const, user: response }
  }
)
```

### Example: Cached Database Query Flow

**Architecture:**
```
entrypoint → flow(deps: [state]) → state (cache) → resource (db) → database
```

**Implementation:**
```typescript
// flow.get-product.ts
import { flow } from '@pumped-fn/core-next'
import { queryCache } from './state.query-cache'

export const getProduct = flow(
  queryCache,
  async (cache, ctx, productId: string) => {
    const product = await cache.query({
      sql: 'SELECT * FROM products WHERE id = ?',
      params: [productId]
    })
    return product
  }
)
```

**Security Note:** Always use parameterized queries to prevent SQL injection. Never concatenate user input into SQL strings.

---

## Troubleshooting

### Problem: "Circular dependency between state and resource"

**Symptom:** State depends on resource which depends on state

**Solution:** Rethink dependency direction. Usually resource should depend on state, not vice versa.

```typescript
// ❌ Circular - don't do this
const state = derive(resource, (r) => r.data)
const resource = derive(state, (s) => makeClient(s))

// ✅ Correct - resource depends on state
const tokenState = provide(() => null)
const apiClient = derive(tokenState.static, (ctl) => makeClient(ctl.get()))
```

### Problem: "Resource not reacting to state changes"

**Symptom:** API client not using updated tokens

**Solution:** Resource derives from state controller, use `.get()` at call time:

```typescript
export const apiClient = derive(oauthTokensCtl, (tokensCtl) => ({
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
- **Flow: Basic** - Explicit dependency injection patterns

## See Also

- [State Patterns Guide](../../../docs/guides/11-state-patterns.md)
