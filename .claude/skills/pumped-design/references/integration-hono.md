---
name: integration-hono
tags: integration, add, hono, http, server, routes, middleware, scope
description: Hono server integration patterns. One scope for application lifetime, attach to context, route handlers call flows via scope.exec(), transform request to flow input, map flow result to HTTP response. Middleware for scope injection. Error handling at route level.
---

# Integration: Hono

## When to Use

- Building HTTP APIs with Hono
- Setting up RESTful endpoints
- Creating middleware chains
- Integrating pumped-fn flows with HTTP handlers

## Scope Lifecycle Pattern

**ONE scope for entire application lifetime**

- Create scope at startup
- Attach to Hono context via middleware
- Reuse across all requests
- Dispose on graceful shutdown

## Core Integration Pattern

### 1. Entrypoint Setup

Create scope at application startup, not per-request:


See: `honoEntrypointSetup` in skill-examples/integrations-hono.ts

```typescript
import { Hono } from 'hono'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey } from './resources'

const app = new Hono()

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    }),
    apiKey(process.env.API_KEY || '')
  ]
})
```

### 2. Scope Injection Middleware

Attach scope to context for all routes:


See: `honoScopeMiddleware` in skill-examples/integrations-hono.ts

```typescript
app.use('*', async (c, next) => {
  c.set('scope', scope)
  await next()
})
```

### 3. Route Handlers with Flow Execution

Transform request → flow input, execute via scope.exec(), map result → HTTP response:


See: `honoRouteHandler` in skill-examples/integrations-hono.ts

```typescript
import { createUser, type CreateUser } from './flows'

app.post('/users', async (c) => {
  const scope = c.get('scope')
  const body = await c.req.json()

  const result = await scope.exec(createUser, {
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    return c.json({ error: result.reason }, 400)
  }

  return c.json(result.user, 201)
})
```

## Complete Working Example


See: `honoCompleteExample` in skill-examples/integrations-hono.ts

```typescript
import { Hono } from 'hono'
import { createScope, Core } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser, getUser, updateUser, deleteUser } from './flows'

const app = new Hono()

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    })
  ]
})

app.use('*', async (c, next) => {
  c.set('scope', scope)
  await next()
})

app.post('/users', async (c) => {
  const scope = c.get('scope')
  const body = await c.req.json()

  const result = await scope.exec(createUser, {
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    const statusMap = {
      INVALID_EMAIL: 400,
      EMAIL_EXISTS: 409,
      NAME_TOO_SHORT: 400
    }
    return c.json({ error: result.reason }, statusMap[result.reason] || 400)
  }

  return c.json(result.user, 201)
})

app.get('/users/:id', async (c) => {
  const scope = c.get('scope')
  const id = c.req.param('id')

  const result = await scope.exec(getUser, { id })

  if (!result.success) {
    return c.json({ error: result.reason }, 404)
  }

  return c.json(result.user, 200)
})

app.put('/users/:id', async (c) => {
  const scope = c.get('scope')
  const id = c.req.param('id')
  const body = await c.req.json()

  const result = await scope.exec(updateUser, {
    id,
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    const statusMap = {
      USER_NOT_FOUND: 404,
      INVALID_EMAIL: 400
    }
    return c.json({ error: result.reason }, statusMap[result.reason] || 400)
  }

  return c.json(result.user, 200)
})

app.delete('/users/:id', async (c) => {
  const scope = c.get('scope')
  const id = c.req.param('id')

  const result = await scope.exec(deleteUser, { id })

  if (!result.success) {
    return c.json({ error: result.reason }, 404)
  }

  return c.json({ success: true }, 200)
})

export default app
```

## Request Transformation Pattern

Extract only what flows need from HTTP request:


See: `honoRequestTransformationFlow` in skill-examples/integrations-hono.ts

```typescript
app.post('/orders', async (c) => {
  const scope = c.get('scope')
  const body = await c.req.json()

  const result = await scope.exec(createOrder, {
    userId: body.userId,
    items: body.items,
    shippingAddress: {
      street: body.shipping.street,
      city: body.shipping.city,
      postalCode: body.shipping.postalCode
    }
  })

  if (!result.success) {
    return c.json({ error: result.reason }, 400)
  }

  return c.json(result.order, 201)
})
```

**Key principle:** Transform HTTP-specific objects (req, body, params) into plain data structures before calling flows.

## Response Mapping Pattern

Map discriminated union outputs to HTTP responses:


See: `honoResponseMappingFlow` in skill-examples/integrations-hono.ts

```typescript
app.post('/checkout', async (c) => {
  const scope = c.get('scope')
  const body = await c.req.json()

  const result = await scope.exec(processCheckout, {
    userId: body.userId,
    cartId: body.cartId,
    paymentMethodId: body.paymentMethodId
  })

  if (!result.success) {
    const statusMap = {
      CART_EMPTY: 400,
      CART_NOT_FOUND: 404,
      PAYMENT_DECLINED: 402,
      INSUFFICIENT_STOCK: 409,
      USER_NOT_FOUND: 404
    }
    return c.json(
      { error: result.reason, message: result.message },
      statusMap[result.reason] || 500
    )
  }

  return c.json({
    orderId: result.orderId,
    total: result.total,
    estimatedDelivery: result.estimatedDelivery
  }, 201)
})
```

## Middleware Patterns

### Authentication Middleware


See: `honoAuthMiddleware` in skill-examples/integrations-hono.ts

```typescript
import { verify } from 'jsonwebtoken'

app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const decoded = verify(token, process.env.JWT_SECRET!)
    c.set('userId', decoded.sub as string)
    await next()
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

app.get('/api/profile', async (c) => {
  const scope = c.get('scope')
  const userId = c.get('userId')

  const result = await scope.exec(getProfile, { userId })

  if (!result.success) {
    return c.json({ error: result.reason }, 404)
  }

  return c.json(result.profile, 200)
})
```

### Request Validation Middleware


See: `honoValidationMiddleware` in skill-examples/integrations-hono.ts

```typescript
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  age: z.number().optional()
})

const validateBody = (schema: z.ZodSchema) => {
  return async (c: any, next: any) => {
    try {
      const body = await c.req.json()
      const validated = schema.parse(body)
      c.set('validatedBody', validated)
      await next()
    } catch (error) {
      return c.json({ error: 'Validation failed', details: error }, 400)
    }
  }
}

app.post('/users', validateBody(createUserSchema), async (c) => {
  const scope = c.get('scope')
  const body = c.get('validatedBody')

  const result = await scope.exec(createUser, body)

  if (!result.success) {
    return c.json({ error: result.reason }, 400)
  }

  return c.json(result.user, 201)
})
```

### Error Handling Middleware


See: `honoErrorMiddleware` in skill-examples/integrations-hono.ts

```typescript
app.onError((error, c) => {
  console.error('Unhandled error:', error)

  return c.json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  }, 500)
})
```

## Graceful Shutdown


See: `honoGracefulShutdown` in skill-examples/integrations-hono.ts

```typescript
import { serve } from '@hono/node-server'

const server = serve({
  fetch: app.fetch,
  port: 3000
})

const shutdown = async () => {
  console.log('Shutting down gracefully...')

  server.close(() => {
    console.log('HTTP server closed')
  })

  await scope.dispose()
  console.log('Resources disposed')

  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('Server listening on port 3000')
```

## Type-safe Context

Extend Hono context with scope type:


See: `honoTypedContext` in skill-examples/integrations-hono.ts

```typescript
import { Hono } from 'hono'
import { Core } from '@pumped-fn/core-next'

type Env = {
  Variables: {
    scope: Core.Scope
    userId?: string
  }
}

const app = new Hono<Env>()

app.use('*', async (c, next) => {
  c.set('scope', scope)
  await next()
})

app.get('/users/:id', async (c) => {
  const scope = c.get('scope')
  const id = c.req.param('id')

  const result = await scope.exec(getUser, { id })

  if (!result.success) {
    return c.json({ error: result.reason }, 404)
  }

  return c.json(result.user)
})
```

## Troubleshooting

### Scope not found in context

**Problem:** `c.get('scope')` returns undefined

**Solution:**
- Ensure middleware runs before routes: `app.use('*', ...)`
- Verify scope creation happens before middleware registration
- Check middleware order (scope injection must be first)

### Scope created per-request

**Problem:** Performance issues, connection pool exhaustion

**Solution:**
```typescript
// ❌ Wrong - creates scope per request
app.use('*', async (c, next) => {
  const scope = createScope({ tags: [...] })
  c.set('scope', scope)
  await next()
})

// ✅ Correct - one scope for app lifetime
const scope = createScope({ tags: [...] })

app.use('*', async (c, next) => {
  c.set('scope', scope)
  await next()
})
```

### Passing req/res to flows

**Problem:** Framework-specific objects in flow inputs

**Solution:**
```typescript
// ❌ Wrong - passing framework objects
const result = await scope.exec(createUser, { req, body: req.body })

// ✅ Correct - extract plain data
const body = await c.req.json()
const result = await scope.exec(createUser, {
  email: body.email,
  name: body.name
})
```

### Missing error branch handling

**Problem:** Some flow error cases not mapped to HTTP status

**Solution:**
```typescript
// ❌ Wrong - incomplete error mapping
if (!result.success) {
  return c.json({ error: result.reason }, 400)
}

// ✅ Correct - explicit status per error reason
if (!result.success) {
  const statusMap = {
    INVALID_EMAIL: 400,
    EMAIL_EXISTS: 409,
    DATABASE_ERROR: 500
  }
  return c.json({ error: result.reason }, statusMap[result.reason] || 500)
}
```

### Resources disposed prematurely

**Problem:** Connections closed while server still running

**Solution:**
```typescript
// ❌ Wrong - disposing too early
app.get('/users', async (c) => {
  const scope = c.get('scope')
  const result = await scope.exec(getUsers, {})
  await scope.dispose() // NEVER do this
  return c.json(result.users)
})

// ✅ Correct - dispose only on shutdown
const shutdown = async () => {
  await scope.dispose()
  process.exit(0)
}
```

## Related Sub-skills

- `coding-standards.md` - Type safety and naming conventions
- `flow-subflows.md` - Orchestrating flows called from routes
- `entrypoint-patterns.md` - Application bootstrap and lifecycle
- `extension-basics.md` - Adding logging/metrics to HTTP handlers
