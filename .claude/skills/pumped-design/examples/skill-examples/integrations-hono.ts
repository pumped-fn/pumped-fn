/**
 * Hono Integration Examples
 *
 * Extracted from integration-hono.md
 */

import { createScope, flow, tag, type Flow, custom } from '@pumped-fn/core-next'

type HonoContext = {
  set: (key: string, value: any) => void
  get: (key: string) => any
  req: {
    json: () => Promise<any>
    param: (name: string) => string
    header: (name: string) => string | undefined
  }
  json: (data: any, status?: number) => any
  cookies: { get: (name: string) => { value?: string } | undefined }
}
type HonoMiddleware = (c: HonoContext, next: () => Promise<void>) => Promise<void | any>
type Hono = {
  use: (path: string, handler: HonoMiddleware) => void
  get: (path: string, handler: (c: HonoContext) => Promise<any>) => void
  post: (path: string, ...handlers: any[]) => void
  put: (path: string, handler: (c: HonoContext) => Promise<any>) => void
  delete: (path: string, handler: (c: HonoContext) => Promise<any>) => void
  onError: (handler: (error: Error, c: HonoContext) => any) => void
  fetch: any
}
type ServeOptions = { fetch: any; port: number }
type Server = { close: (callback: () => void) => void }
const serve = (options: ServeOptions): Server => ({} as any)
const verify = (token: string, secret: string): any => ({} as any)
namespace z {
  export const object = (schema: any) => ({ parse: (data: any) => data })
  export const string = () => ({ email: () => ({ min: (n: number) => ({}) }), min: (n: number) => ({}) })
  export const number = () => ({ optional: () => ({}) })
  export type ZodSchema = any
}

// ============================================================================
// HONO INTEGRATION
// ============================================================================

/**
 * Hono Entrypoint Setup
 *
 * Demonstrates creating scope at startup, not per-request.
 *
 * Referenced in: integration-hono.md
 * Section: Entrypoint Setup
 */
namespace Config {
  export type Database = {
    host: string
    port: number
    database: string
    user?: string
    password?: string
  }
}

const dbConfigTag = tag(custom<Config.Database>(), { label: 'db-config' })
const apiKeyTag = tag(custom<string>(), { label: 'api-key' })

export const honoEntrypointSetup = () => {
  const app = {} as Hono

  const scope = createScope({
    tags: [
      dbConfigTag({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'app',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
      }),
      apiKeyTag(process.env.API_KEY || '')
    ]
  })

  return { app, scope }
}

/**
 * Hono Scope Injection Middleware
 *
 * Attaches scope to context for all routes.
 *
 * Referenced in: integration-hono.md
 * Section: Scope Injection Middleware
 */
export const honoScopeMiddleware = (app: Hono, scope: any) => {
  app.use('*', async (c: HonoContext, next: () => Promise<void>) => {
    c.set('scope', scope)
    await next()
  })
}

/**
 * Hono Route Handler with Flow
 *
 * Transform request → flow input, execute, map result → response.
 *
 * Referenced in: integration-hono.md
 * Section: Route Handlers with Flow Execution
 */
export const honoRouteHandler = flow(
  async (ctx: any, input: { email: string; name: string }) => {
    return { success: true, user: { id: '1', email: input.email, name: input.name } }
  }
)

/**
 * Hono Complete Working Example
 *
 * Full CRUD API with scope, middleware, and routes.
 *
 * Referenced in: integration-hono.md
 * Section: Complete Working Example
 */
export const honoCompleteExample = () => {
  const app: Hono = {} as any

  const scope = createScope({
    tags: [
      dbConfigTag({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'app',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
      })
    ]
  })

  app.use('*', async (c: HonoContext, next: () => Promise<void>) => {
    c.set('scope', scope)
    await next()
  })

  app.post('/users', async (c: HonoContext) => {
    const scope = c.get('scope') as any
    const body = await c.req.json()

    const result = await scope.exec(honoRouteHandler, {
      email: body.email,
      name: body.name
    })

    if (!result.success) {
      const statusMap = {
        INVALID_EMAIL: 400,
        EMAIL_EXISTS: 409,
        NAME_TOO_SHORT: 400
      }
      return c.json({ error: result.reason }, (statusMap as any)[result.reason] || 400)
    }

    return c.json(result.user, 201)
  })

  app.get('/users/:id', async (c: HonoContext) => {
    const scope = c.get('scope') as any
    const id = c.req.param('id')

    const getUserFlow = flow(
      async (ctx: any, input: { id: string }) => {
        return { success: true, user: { id: input.id, name: 'Alice', email: 'alice@example.com' } }
      }
    )

    const result = await scope.exec(getUserFlow, { id })

    if (!result.success) {
      return c.json({ error: result.reason }, 404)
    }

    return c.json(result.user, 200)
  })

  app.put('/users/:id', async (c) => {
    const scope = c.get('scope') as any
    const id = c.req.param('id')
    const body = await c.req.json()

    const updateUserFlow = flow(
      async (ctx: any, input: { id: string; email: string; name: string }) => {
        return { success: true, user: { id: input.id, email: input.email, name: input.name } }
      }
    )

    const result = await scope.exec(updateUserFlow, {
      id,
      email: body.email,
      name: body.name
    })

    if (!result.success) {
      const statusMap = {
        USER_NOT_FOUND: 404,
        INVALID_EMAIL: 400
      }
      return c.json({ error: result.reason }, (statusMap as any)[result.reason] || 400)
    }

    return c.json(result.user, 200)
  })

  app.delete('/users/:id', async (c) => {
    const scope = c.get('scope') as any
    const id = c.req.param('id')

    const deleteUserFlow = flow(
      async (ctx: any, input: { id: string }) => {
        return { success: true }
      }
    )

    const result = await scope.exec(deleteUserFlow, { id })

    if (!result.success) {
      return c.json({ error: result.reason }, 404)
    }

    return c.json({ success: true }, 200)
  })

  return app
}

/**
 * Hono Request Transformation Pattern
 *
 * Extract only what flows need from HTTP request.
 *
 * Referenced in: integration-hono.md
 * Section: Request Transformation Pattern
 */
export const honoRequestTransformationFlow = flow(
  async (ctx: any, input: { userId: string; items: any[]; shippingAddress: any }) => {
    return { success: true, order: { id: '1', userId: input.userId } }
  }
)

export const honoRequestTransformationRoute = (app: Hono) => {
  app.post('/orders', async (c: HonoContext) => {
    const scope = c.get('scope') as any
    const body = await c.req.json()

    const result = await scope.exec(honoRequestTransformationFlow, {
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
}

/**
 * Hono Response Mapping Pattern
 *
 * Map discriminated union outputs to HTTP responses.
 *
 * Referenced in: integration-hono.md
 * Section: Response Mapping Pattern
 */
export const honoResponseMappingFlow = flow(
  async (ctx: any, input: { userId: string; cartId: string; paymentMethodId: string }) => {
    return { success: true, orderId: '1', total: 100, estimatedDelivery: new Date() }
  }
)

export const honoResponseMappingRoute = (app: Hono) => {
  app.post('/checkout', async (c: HonoContext) => {
    const scope = c.get('scope') as any
    const body = await c.req.json()

    const result = await scope.exec(honoResponseMappingFlow, {
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
        { error: result.reason, message: (result as any).message },
        (statusMap as any)[result.reason] || 500
      )
    }

    return c.json({
      orderId: result.orderId,
      total: result.total,
      estimatedDelivery: result.estimatedDelivery
    }, 201)
  })
}

/**
 * Hono Authentication Middleware
 *
 * JWT verification and user context injection.
 *
 * Referenced in: integration-hono.md
 * Section: Authentication Middleware
 */
export const honoAuthMiddleware = (app: Hono) => {
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
    const scope = c.get('scope') as any
    const userId = c.get('userId')

    const getProfileFlow = flow(
      async (ctx: any, input: { userId: string }) => {
        return { success: true, profile: { userId: input.userId } }
      }
    )

    const result = await scope.exec(getProfileFlow, { userId })

    if (!result.success) {
      return c.json({ error: result.reason }, 404)
    }

    return c.json(result.profile, 200)
  })
}

/**
 * Hono Request Validation Middleware
 *
 * Zod schema validation for request bodies.
 *
 * Referenced in: integration-hono.md
 * Section: Request Validation Middleware
 */
export const honoValidationMiddleware = () => {
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

  return { createUserSchema, validateBody }
}

export const honoValidationRoute = (app: Hono) => {
  const { createUserSchema, validateBody } = honoValidationMiddleware()

  app.post('/users', validateBody(createUserSchema), async (c: HonoContext) => {
    const scope = c.get('scope') as any
    const body = c.get('validatedBody')

    const createUserFlow = flow(
      async (ctx: any, input: any) => {
        return { success: true, user: { id: '1', ...input } }
      }
    )

    const result = await scope.exec({ flow: createUserFlow, input: body })

    if (!result.success) {
      return c.json({ error: result.reason }, 400)
    }

    return c.json(result.user, 201)
  })
}

/**
 * Hono Error Handling Middleware
 *
 * Global error handler for unhandled errors.
 *
 * Referenced in: integration-hono.md
 * Section: Error Handling Middleware
 */
export const honoErrorMiddleware = (app: Hono) => {
  app.onError((error, c) => {
    console.error('Unhandled error:', error)

    return c.json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500)
  })
}

/**
 * Hono Graceful Shutdown
 *
 * Handle SIGTERM/SIGINT and dispose resources.
 *
 * Referenced in: integration-hono.md
 * Section: Graceful Shutdown
 */
export const honoGracefulShutdown = (app: Hono, scope: any) => {
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
}

/**
 * Hono Type-safe Context
 *
 * Extend Hono context with scope type.
 *
 * Referenced in: integration-hono.md
 * Section: Type-safe Context
 */
export const honoTypedContext = () => {
  type Env = {
    Variables: {
      scope: any
      userId?: string
    }
  }

  const app: Hono = {} as any

  const scope = createScope({ tags: [] })

  app.use('*', async (c: HonoContext, next: () => Promise<void>) => {
    c.set('scope', scope)
    await next()
  })

  app.get('/users/:id', async (c: HonoContext) => {
    const scope = c.get('scope') as any
    const id = c.req.param('id')

    const getUserFlow = flow(
      async (ctx: any, input: { id: string }) => {
        return { success: true, user: { id: input.id, name: 'Alice', email: 'alice@example.com' } }
      }
    )

    const result = await scope.exec(getUserFlow, { id })

    if (!result.success) {
      return c.json({ error: result.reason }, 404)
    }

    return c.json(result.user)
  })

  return app
}
