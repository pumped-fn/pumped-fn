---
name: entrypoint-patterns
tags: entrypoint, add, scope, lifecycle, initialization, shutdown, cli, http, lambda, tags, extensions
description: Structuring application entrypoints with createScope(), tags, and extensions. Covers environment-specific patterns (CLI, HTTP, Lambda), graceful shutdown, and scope lifecycle management.
---

# Entrypoint: Patterns

## When to Use

Use entrypoint patterns when:

- Starting application (main.ts, index.ts, app.ts)
- Initializing servers (HTTP, WebSocket, etc.)
- Setting up CLI commands
- Configuring Lambda handlers
- Establishing scope lifecycle

**Core principle:** ONE scope per application lifetime (HTTP/cron) or ONE scope per invocation (CLI/Lambda)

---

## Code Template

### HTTP Server Entrypoint

```typescript
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey } from './resources'
import { loggingExtension, metricsExtension } from './extensions'
import express from 'express'

const app = express()
app.use(express.json())

// ONE scope for entire application
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

// Routes use scope via context
app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await scope.exec(createUser, {
    email: req.body.email,
    name: req.body.name
  })

  if (!result.success) {
    return res.status(400).json({ error: result.reason })
  }

  res.status(201).json(result.user)
})

const server = app.listen(3000, () => {
  console.log('Server listening on port 3000')
})

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...')

  await new Promise<void>((resolve) => {
    server.close(() => {
      console.log('HTTP server closed')
      resolve()
    })
  })

  await scope.dispose()
  console.log('Resources disposed')

  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

### CLI Entrypoint

```typescript
import { Command } from 'commander'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser } from './flows'

const program = new Command()

program
  .name('app')
  .description('Application CLI')
  .version('1.0.0')

program
  .command('create-user')
  .argument('<email>', 'User email')
  .argument('<name>', 'User name')
  .action(async (email, name) => {
    // ONE scope per command execution
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

program.parse()
```

### Lambda Entrypoint

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser } from './flows'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // ONE scope per invocation
  const scope = createScope({
    tags: [
      dbConfig({
        host: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!
      })
    ]
  })

  try {
    if (event.httpMethod === 'POST' && event.path === '/users') {
      const body = JSON.parse(event.body || '{}')

      const result = await scope.exec(createUser, {
        email: body.email,
        name: body.name
      })

      if (!result.success) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: result.reason })
        }
      }

      return {
        statusCode: 201,
        body: JSON.stringify(result.user)
      }
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    }
  } finally {
    await scope.dispose()
  }
}
```

---

## Scope Creation Patterns

### With Tags (Configuration)

```typescript
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey, logLevel } from './resources'

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app'
    }),
    apiKey(process.env.API_KEY || ''),
    logLevel(process.env.LOG_LEVEL || 'info')
  ]
})
```

### With Extensions (Observability)

```typescript
import { createScope } from '@pumped-fn/core-next'
import { loggingExtension, metricsExtension, tracingExtension } from './extensions'

const scope = createScope({
  extensions: [
    tracingExtension,      // First: sets trace context
    loggingExtension,      // Second: logs with context
    metricsExtension       // Third: records metrics
  ]
})
```

### With Both Tags and Extensions

```typescript
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { loggingExtension } from './extensions'

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app'
    })
  ],
  extensions: [loggingExtension]
})
```

---

## Environment-Specific Patterns

### HTTP Server (Express/Hono/Fastify)

**Scope lifecycle:** ONE scope for entire application lifetime

```typescript
// Express
const app = express()
const scope = createScope({ tags: [...], extensions: [...] })
app.set('scope', scope)

// Hono
const app = new Hono()
const scope = createScope({ tags: [...], extensions: [...] })
app.use('*', async (c, next) => {
  c.set('scope', scope)
  await next()
})

// Fastify
const fastify = Fastify()
const scope = createScope({ tags: [...], extensions: [...] })
fastify.decorate('scope', scope)
fastify.addHook('onClose', async () => {
  await scope.dispose()
})
```

**Key points:**
- Create scope once at startup
- Attach to app context
- Reuse across all requests
- Dispose on shutdown

### CLI (Commander)

**Scope lifecycle:** ONE scope PER COMMAND execution

```typescript
const program = new Command()

program
  .command('create-user')
  .action(async (email, name) => {
    const scope = createScope({ tags: [...] })
    try {
      const result = await scope.exec(createUser, { email, name })
      console.log(result)
    } finally {
      await scope.dispose()
    }
  })

program
  .command('list-users')
  .action(async () => {
    const scope = createScope({ tags: [...] })
    try {
      const result = await scope.exec(listUsers, {})
      console.table(result.users)
    } finally {
      await scope.dispose()
    }
  })
```

**Optimization:** Use factory to reduce duplication

```typescript
const createAppScope = () => createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app'
    })
  ]
})

program
  .command('create-user')
  .action(async (email, name) => {
    const scope = createAppScope()
    try {
      await scope.exec(createUser, { email, name })
    } finally {
      await scope.dispose()
    }
  })
```

**Key points:**
- New scope per command
- Always dispose in finally
- Use factory for consistency
- Exit with error code on failure

### Scheduled Jobs (Cron)

**Scope lifecycle:** ONE scope for entire job runner lifetime

```typescript
import cron from 'node-cron'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { cleanupExpiredSessions, sendDailyReport } from './flows'

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app'
    })
  ]
})

cron.schedule('0 * * * *', async () => {
  console.log('Running hourly cleanup...')

  const result = await scope.exec(cleanupExpiredSessions, {
    olderThan: new Date(Date.now() - 24 * 60 * 60 * 1000)
  })

  if (!result.success) {
    console.error('Cleanup failed:', result.reason)
    return
  }

  console.log(`Cleaned up ${result.count} sessions`)
})

cron.schedule('0 9 * * *', async () => {
  console.log('Sending daily report...')

  const result = await scope.exec(sendDailyReport, {
    date: new Date()
  })

  if (!result.success) {
    console.error('Report failed:', result.reason)
    return
  }

  console.log('Report sent successfully')
})

const shutdown = async () => {
  console.log('Shutting down job runner...')
  await scope.dispose()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

**Key points:**
- One scope for all jobs
- Resources shared (efficient pooling)
- Jobs isolated via flow execution
- Dispose on shutdown

### Event Processors (Kafka/SQS)

**Scope lifecycle:** ONE scope for entire consumer lifetime

```typescript
import { Kafka } from 'kafkajs'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { processOrderCreated, processUserRegistered } from './flows'

const kafka = new Kafka({
  clientId: 'app',
  brokers: ['localhost:9092']
})

const consumer = kafka.consumer({ groupId: 'app-group' })

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app'
    })
  ]
})

await consumer.connect()
await consumer.subscribe({ topic: 'orders', fromBeginning: false })
await consumer.subscribe({ topic: 'users', fromBeginning: false })

await consumer.run({
  eachMessage: async ({ topic, message }) => {
    const value = JSON.parse(message.value?.toString() || '{}')

    try {
      switch (topic) {
        case 'orders': {
          const result = await scope.exec(processOrderCreated, {
            orderId: value.orderId,
            userId: value.userId,
            items: value.items
          })

          if (!result.success) {
            console.error(`Order processing failed: ${result.reason}`)
          }
          break
        }

        case 'users': {
          const result = await scope.exec(processUserRegistered, {
            userId: value.userId,
            email: value.email
          })

          if (!result.success) {
            console.error(`User processing failed: ${result.reason}`)
          }
          break
        }
      }
    } catch (error) {
      console.error(`Message processing error:`, error)
    }
  }
})

const shutdown = async () => {
  console.log('Shutting down consumer...')
  await consumer.disconnect()
  await scope.dispose()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

**Key points:**
- One scope for consumer lifetime
- Resources shared across messages
- Each message processed via flow
- Error handling per message (don't crash consumer)

### Serverless (Lambda/Workers)

**Scope lifecycle:** ONE scope PER INVOCATION

```typescript
// AWS Lambda
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser } from './flows'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
    const body = JSON.parse(event.body || '{}')

    const result = await scope.exec(createUser, {
      email: body.email,
      name: body.name
    })

    if (!result.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: result.reason })
      }
    }

    return {
      statusCode: 201,
      body: JSON.stringify(result.user)
    }
  } finally {
    await scope.dispose()
  }
}
```

```typescript
// Cloudflare Workers
import { createScope } from '@pumped-fn/core-next'
import { apiKey } from './resources'
import { processRequest } from './flows'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const scope = createScope({
      tags: [apiKey(env.API_KEY)]
    })

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
```

**Key points:**
- New scope per invocation
- Always dispose in finally
- Cold start overhead acceptable
- Stateless (no shared scope)

### Next.js/Meta-frameworks

**Scope lifecycle:** Module-level scope (singleton)

```typescript
// src/lib/scope.ts
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey } from '@/resources'

export const appScope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app'
    }),
    apiKey(process.env.API_KEY || '')
  ]
})
```

```typescript
// src/app/api/users/route.ts
import { appScope } from '@/lib/scope'
import { createUser } from '@/flows'

export async function POST(request: Request) {
  const body = await request.json()

  const result = await appScope.exec(createUser, {
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    return Response.json({ error: result.reason }, { status: 400 })
  }

  return Response.json(result.user, { status: 201 })
}
```

**Key points:**
- Module-level scope
- Import where needed
- Use in server components/API routes
- Never dispose (long-running server)

---

## Graceful Shutdown

### HTTP Server Shutdown

```typescript
const server = app.listen(3000)

const shutdown = async () => {
  console.log('Shutting down gracefully...')

  // 1. Stop accepting new connections
  await new Promise<void>((resolve) => {
    server.close(() => {
      console.log('HTTP server closed')
      resolve()
    })
  })

  // 2. Dispose resources (database pools, connections, etc.)
  await scope.dispose()
  console.log('Resources disposed')

  // 3. Exit cleanly
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error)
  await shutdown()
})

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled rejection:', reason)
  await shutdown()
})
```

### CLI Shutdown

```typescript
program
  .command('create-user')
  .action(async (email, name) => {
    const scope = createScope({ tags: [...] })
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
```

### Job Runner Shutdown

```typescript
const scope = createScope({ tags: [...] })

cron.schedule('0 * * * *', async () => {
  const result = await scope.exec(cleanupExpiredSessions, {})
  if (!result.success) {
    console.error('Cleanup failed:', result.reason)
  }
})

const shutdown = async () => {
  console.log('Shutting down job runner...')
  await scope.dispose()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

---

## Real Examples from Pumped-fn Tests

### Example 1: Basic Scope with Tags (packages/next/tests/scope-run.test.ts)

```typescript
const scope = createScope()
const userService = provide(() => ({ listAll: () => ["user1", "user2"] }))

const result = await scope.run({ userService }, ({ userService }) =>
  userService.listAll()
)

expect(result).toEqual(["user1", "user2"])
await scope.dispose()
```

### Example 2: Scope with Multiple Executors (packages/next/tests/scope-run.test.ts)

```typescript
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
```

---

## Troubleshooting

### Resources Not Cleaned Up

**Problem:** Memory leaks, open connections after shutdown

**Solutions:**
- Always call scope.dispose()
- Use try/finally in CLI/Lambda
- Register cleanup handlers for HTTP servers
- Check controller.cleanup() in resources

```typescript
// ❌ Wrong - no disposal
const scope = createScope({ tags: [...] })
await scope.exec(createUser, input)
// Scope never disposed!

// ✅ Correct - disposed in finally
const scope = createScope({ tags: [...] })
try {
  await scope.exec(createUser, input)
} finally {
  await scope.dispose()
}
```

### Multiple Scopes in HTTP Server

**Problem:** Creating scope per request (inefficient)

**Solutions:**
- Create ONE scope at startup
- Attach to app context
- Reuse across requests

```typescript
// ❌ Wrong - scope per request
app.post('/users', async (req, res) => {
  const scope = createScope({ tags: [...] })  // New scope every request!
  const result = await scope.exec(createUser, req.body)
  await scope.dispose()
  res.json(result)
})

// ✅ Correct - shared scope
const scope = createScope({ tags: [...] })
app.set('scope', scope)

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await scope.exec(createUser, req.body)
  res.json(result)
})
```

### Forgot Shutdown Handlers

**Problem:** Process doesn't exit cleanly

**Solutions:**
- Register SIGTERM/SIGINT handlers
- Close server before disposing scope
- Handle uncaught exceptions

```typescript
// ❌ Wrong - no shutdown handler
const server = app.listen(3000)
const scope = createScope({ tags: [...] })
// No way to dispose on shutdown!

// ✅ Correct - graceful shutdown
const server = app.listen(3000)
const scope = createScope({ tags: [...] })

const shutdown = async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  await scope.dispose()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

### Environment Variables Not Loaded

**Problem:** Tags receive undefined values

**Solutions:**
- Load dotenv before scope creation
- Provide defaults for development
- Validate required env vars

```typescript
// ❌ Wrong - no defaults or validation
const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST,  // Might be undefined!
      port: parseInt(process.env.DB_PORT),  // NaN if missing!
      database: process.env.DB_NAME
    })
  ]
})

// ✅ Correct - defaults and validation
import 'dotenv/config'

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
```

### Lambda Cold Start Performance

**Problem:** Slow Lambda cold starts

**Solutions:**
- Accept per-invocation scope creation overhead
- Resources cached after first invocation
- Use provisioned concurrency if needed

```typescript
// ✅ Correct - scope per invocation is expected
export const handler = async (event: APIGatewayProxyEvent) => {
  const scope = createScope({ tags: [...] })  // Cold start overhead acceptable
  try {
    return await scope.exec(processRequest, event)
  } finally {
    await scope.dispose()
  }
}
```

---

## Anti-patterns

### ❌ Don't Create Global Scope

```typescript
// ❌ Wrong - global scope
const scope = createScope({ tags: [...] })

export { scope }  // Don't export global scope

// ✅ Correct - create at entrypoint
function main() {
  const scope = createScope({ tags: [...] })
  // Use scope here
}
```

### ❌ Don't Forget finally in CLI/Lambda

```typescript
// ❌ Wrong - no finally
const scope = createScope({ tags: [...] })
const result = await scope.exec(createUser, input)
await scope.dispose()  // Skipped if exec throws!

// ✅ Correct - dispose in finally
const scope = createScope({ tags: [...] })
try {
  const result = await scope.exec(createUser, input)
} finally {
  await scope.dispose()
}
```

### ❌ Don't Mix Scope Lifecycles

```typescript
// ❌ Wrong - mixing patterns
const globalScope = createScope({ tags: [...] })

app.post('/users', async (req, res) => {
  const requestScope = createScope({ tags: [...] })  // Don't mix!
  // ...
})

// ✅ Correct - one pattern
const scope = createScope({ tags: [...] })
app.set('scope', scope)

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  // ...
})
```

---

## Related Sub-skills

- **extension-basics** - Adding extensions to scope for observability
- **resource-basic** - Creating resources that scope manages
- **integration-hono** - Hono-specific entrypoint patterns
- **integration-nextjs** - Next.js module-level scope patterns
