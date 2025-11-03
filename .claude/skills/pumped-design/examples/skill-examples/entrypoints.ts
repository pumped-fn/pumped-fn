/**
 * Entrypoint Examples
 *
 * Extracted from entrypoint-patterns.md
 */

import { createScope, provide } from '@pumped-fn/core-next'

/**
 * HTTP Server Entrypoint
 *
 * ONE scope for entire application lifetime. Create once, attach to context, reuse, dispose on shutdown.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Code Template - HTTP Server Entrypoint
 */
export const httpServerEntrypoint = () => {
  const app = express()
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
    ],
    extensions: [loggingExtension, metricsExtension]
  })

  app.set('scope', scope)

  app.post('/users', async (req, res) => {
    const scope = req.app.get('scope')
    const result = await scope.exec(createUser, req.body)
    if (!result.success) {
      return res.status(400).json({ error: result.reason })
    }
    res.status(201).json(result.user)
  })

  const server = app.listen(3000)

  const shutdown = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await scope.dispose()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

/**
 * CLI Entrypoint
 *
 * ONE scope per command execution. Create per invocation, dispose in finally.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Code Template - CLI Entrypoint
 */
export const cliEntrypoint = () => {
  const program = new Command()

  program
    .command('create-user')
    .argument('<email>', 'User email')
    .argument('<name>', 'User name')
    .action(async (email, name) => {
      const scope = createScope({
        tags: [
          dbConfig({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'app'
          })
        ]
      })

      try {
        const result = await scope.exec(createUser, { email, name })
        if (!result.success) {
          console.error(`Error: ${result.reason}`)
          process.exit(1)
        }
        console.log('User created:', result.user)
      } finally {
        await scope.dispose()
      }
    })
}

/**
 * Lambda Entrypoint
 *
 * ONE scope per invocation. Create per Lambda call, dispose in finally, stateless.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Code Template - Lambda Entrypoint
 */
export const lambdaEntrypoint = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const scope = createScope({
    tags: [
      dbConfig({
        host: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME!
      })
    ]
  })

  try {
    if (event.httpMethod === 'POST' && event.path === '/users') {
      const body = JSON.parse(event.body || '{}')
      const result = await scope.exec(createUser, { email: body.email, name: body.name })

      if (!result.success) {
        return { statusCode: 400, body: JSON.stringify({ error: result.reason }) }
      }
      return { statusCode: 201, body: JSON.stringify(result.user) }
    }
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) }
  } finally {
    await scope.dispose()
  }
}

/**
 * Scope Creation Patterns
 *
 * Extension order matters: tracing → logging → metrics
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Scope Creation Patterns
 */
export const scopeCreationWithTags = createScope({
  tags: [
    dbConfig({ host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT || '5432') }),
    apiKey(process.env.API_KEY || ''),
    logLevel(process.env.LOG_LEVEL || 'info')
  ]
})

export const scopeCreationWithExtensions = createScope({
  extensions: [tracingExtension, loggingExtension, metricsExtension]
})

export const scopeCreationWithBoth = createScope({
  tags: [dbConfig({ host: process.env.DB_HOST || 'localhost' })],
  extensions: [loggingExtension]
})

/**
 * HTTP Framework Patterns
 *
 * Express, Hono, Fastify: ONE scope for application lifetime.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Environment-Specific Patterns - HTTP Server
 */
export const httpFrameworkPatterns = {
  express: () => {
    const app = express()
    const scope = createScope({ tags: [] })
    app.set('scope', scope)
  },

  hono: () => {
    const app = new Hono()
    const scope = createScope({ tags: [] })
    app.use('*', async (c, next) => {
      c.set('scope', scope)
      await next()
    })
  },

  fastify: () => {
    const fastify = Fastify()
    const scope = createScope({ tags: [] })
    fastify.decorate('scope', scope)
    fastify.addHook('onClose', async () => await scope.dispose())
  }
}

/**
 * CLI Factory Pattern
 *
 * Reduce duplication with factory function.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Environment-Specific Patterns - CLI Optimization
 */
export const cliWithFactory = () => {
  const createAppScope = () => createScope({
    tags: [dbConfig({ host: process.env.DB_HOST || 'localhost' })]
  })

  const program = new Command()

  program.command('create-user').action(async (email, name) => {
    const scope = createAppScope()
    try {
      await scope.exec(createUser, { email, name })
    } finally {
      await scope.dispose()
    }
  })
}

/**
 * Scheduled Jobs
 *
 * ONE scope for job runner lifetime. Resources shared, jobs isolated via flow.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Environment-Specific Patterns - Scheduled Jobs
 */
export const cronEntrypoint = () => {
  const scope = createScope({
    tags: [dbConfig({ host: process.env.DB_HOST || 'localhost' })]
  })

  cron.schedule('0 * * * *', async () => {
    const result = await scope.exec(cleanupExpiredSessions, {
      olderThan: new Date(Date.now() - 24 * 60 * 60 * 1000)
    })
    if (!result.success) {
      console.error('Cleanup failed:', result.reason)
    }
  })

  const shutdown = async () => {
    await scope.dispose()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

/**
 * Event Processor
 *
 * ONE scope for consumer lifetime. Resources shared, messages processed via flow.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Environment-Specific Patterns - Event Processors
 */
export const kafkaConsumerEntrypoint = async () => {
  const kafka = new Kafka({ clientId: 'app', brokers: ['localhost:9092'] })
  const consumer = kafka.consumer({ groupId: 'app-group' })
  const scope = createScope({ tags: [dbConfig({ host: process.env.DB_HOST || 'localhost' })] })

  await consumer.connect()
  await consumer.subscribe({ topic: 'orders', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const value = JSON.parse(message.value?.toString() || '{}')
      try {
        const result = await scope.exec(processOrderCreated, value)
        if (!result.success) {
          console.error(`Processing failed: ${result.reason}`)
        }
      } catch (error) {
        console.error(`Message error:`, error)
      }
    }
  })

  const shutdown = async () => {
    await consumer.disconnect()
    await scope.dispose()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

/**
 * Serverless Patterns
 *
 * Scope per invocation. Cold start overhead acceptable.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Environment-Specific Patterns - Serverless
 */
export const cloudflareWorkerHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const scope = createScope({ tags: [apiKey(env.API_KEY)] })
    try {
      const url = new URL(request.url)
      const result = await scope.exec(processRequest, {
        path: url.pathname,
        method: request.method,
        body: request.method !== 'GET' ? await request.json() : undefined
      })
      if (!result.success) {
        return Response.json({ error: result.reason }, { status: 400 })
      }
      return Response.json(result.data)
    } finally {
      await scope.dispose()
    }
  }
}

/**
 * Next.js Module-level Scope
 *
 * Singleton pattern. Import where needed, never dispose.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Environment-Specific Patterns - Next.js
 */
export const nextjsAppScope = createScope({
  tags: [
    dbConfig({ host: process.env.DB_HOST || 'localhost' }),
    apiKey(process.env.API_KEY || '')
  ]
})

export const nextjsApiRoute = async (request: Request) => {
  const body = await request.json()
  const result = await nextjsAppScope.exec(createUser, { email: body.email, name: body.name })
  if (!result.success) {
    return Response.json({ error: result.reason }, { status: 400 })
  }
  return Response.json(result.user, { status: 201 })
}

/**
 * Real Test Examples
 *
 * scope.run() patterns from actual test suite.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Real Examples from Pumped-fn Tests
 */
export const basicScopeRun = async () => {
  const scope = createScope()
  const userService = provide(() => ({ listAll: () => ["user1", "user2"] }))

  const result = await scope.run({ userService }, ({ userService }) =>
    userService.listAll()
  )

  expect(result).toEqual(["user1", "user2"])
  await scope.dispose()
}

export const scopeRunMultipleExecutors = async () => {
  const scope = createScope()
  const userService = provide(() => ({ getUser: (id: string) => `user-${id}` }))
  const postDb = provide(() => ({ getPosts: (page: number) => [`post-${page}`] }))

  const result = await scope.run(
    { userService, postDb },
    ({ userService, postDb }, userId: string, page: number) => ({
      user: userService.getUser(userId),
      posts: postDb.getPosts(page),
    }),
    ["user123", 1]
  )

  expect(result).toEqual({
    user: "user-user123",
    posts: ["post-1"],
  })
  await scope.dispose()
}

/**
 * Common Patterns
 *
 * Correct disposal, shared scope, env validation.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Troubleshooting and Anti-patterns
 */
export const correctDisposalPattern = async () => {
  const scope = createScope({ tags: [] })
  try {
    await scope.exec(createUser, input)
  } finally {
    await scope.dispose()
  }
}

export const sharedHttpScope = () => {
  const scope = createScope({ tags: [] })
  app.set('scope', scope)

  app.post('/users', async (req, res) => {
    const scope = req.app.get('scope')
    const result = await scope.exec(createUser, req.body)
    res.json(result)
  })
}

export const envVarsValidation = () => {
  const requiredEnvVars = ['DB_HOST', 'DB_NAME']
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required env var: ${varName}`)
    }
  }

  const scope = createScope({
    tags: [
      dbConfig({
        host: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME!
      })
    ]
  })
}
