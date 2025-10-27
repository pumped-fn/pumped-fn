## Environment-Specific Guidance

**Purpose:** Scope lifecycle patterns for different deployment environments. Each environment has specific patterns for scope creation, attachment, and disposal.

---

### Backend: HTTP Servers (Express, Fastify, Hono)

**Scope lifecycle:** ONE scope for entire application lifetime.

**Pattern:**
- Create scope at startup
- Attach to app context (req.app, app.state, ctx.state)
- Reuse across all requests
- Dispose on graceful shutdown

**Example (Express):**

```typescript
import express from 'express'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey } from './resources'
import { createUser, getUser } from './flows'

const app = express()
app.use(express.json())

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

app.set('scope', scope)

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

app.get('/users/:id', async (req, res) => {
  const scope = req.app.get('scope')

  const result = await scope.exec(getUser, { id: req.params.id })

  if (!result.success) {
    return res.status(404).json({ error: result.reason })
  }

  res.json(result.user)
})

const server = app.listen(3000, () => {
  console.log('Server listening on port 3000')
})

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

**Example (Fastify):**

```typescript
import Fastify from 'fastify'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser } from './flows'

const fastify = Fastify()

const scope = createScope({
  tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app', user: 'postgres', password: 'postgres' })]
})

fastify.decorate('scope', scope)

fastify.post('/users', async (request, reply) => {
  const result = await fastify.scope.exec(createUser, {
    email: request.body.email,
    name: request.body.name
  })

  if (!result.success) {
    return reply.code(400).send({ error: result.reason })
  }

  reply.code(201).send(result.user)
})

fastify.addHook('onClose', async () => {
  await scope.dispose()
})

await fastify.listen({ port: 3000 })
```

**Example (Hono):**

```typescript
import { Hono } from 'hono'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser } from './flows'

const app = new Hono()

const scope = createScope({
  tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app', user: 'postgres', password: 'postgres' })]
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
    return c.json({ error: result.reason }, 400)
  }

  return c.json(result.user, 201)
})

export default app
```

**Key points:**
- ✅ One scope created at app initialization
- ✅ Scope attached to framework context
- ✅ All routes use same scope via context
- ✅ Dispose on shutdown (graceful)
- ❌ Don't create scope per request
- ❌ Don't resolve executors in routes (use scope.exec)

---

### Backend: CLI Applications (Commander)

**Scope lifecycle:** ONE scope PER COMMAND execution.

**Pattern:**
- Create scope when command starts
- Execute command logic
- Dispose in finally block
- Each command isolated

**Example (Commander):**

```typescript
import { Command } from 'commander'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser, listUsers, deleteUser } from './flows'

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

program
  .command('list-users')
  .action(async () => {
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
      const result = await scope.exec(listUsers, {})

      if (!result.success) {
        console.error(`Error: ${result.reason}`)
        process.exit(1)
      }

      console.table(result.users)
    } finally {
      await scope.dispose()
    }
  })

program
  .command('delete-user')
  .argument('<id>', 'User ID')
  .action(async (id) => {
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
      const result = await scope.exec(deleteUser, { id })

      if (!result.success) {
        console.error(`Error: ${result.reason}`)
        process.exit(1)
      }

      console.log('User deleted')
    } finally {
      await scope.dispose()
    }
  })

program.parse()
```

**Optimization (shared config factory):**

```typescript
import { Command } from 'commander'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser, listUsers } from './flows'

const createAppScope = () => createScope({
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

const program = new Command()

program
  .command('create-user')
  .argument('<email>', 'User email')
  .argument('<name>', 'User name')
  .action(async (email, name) => {
    const scope = createAppScope()
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

program
  .command('list-users')
  .action(async () => {
    const scope = createAppScope()
    try {
      const result = await scope.exec(listUsers, {})
      if (!result.success) {
        console.error(`Error: ${result.reason}`)
        process.exit(1)
      }
      console.table(result.users)
    } finally {
      await scope.dispose()
    }
  })

program.parse()
```

**Key points:**
- ✅ New scope per command execution
- ✅ Always dispose in finally
- ✅ Exit with error code on failure
- ✅ Use factory to reduce duplication
- ❌ Don't create global scope (command isolation)
- ❌ Don't forget finally block

---

### Backend: Scheduled Jobs (Cron)

**Scope lifecycle:** ONE scope for entire job runner lifetime.

**Pattern:**
- Create scope at job runner initialization
- Reuse scope across all job executions
- Jobs share resources (connection pools)
- Dispose on shutdown

**Example (node-cron):**

```typescript
import cron from 'node-cron'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { cleanupExpiredSessions, sendDailyReport, syncExternalData } from './flows'

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

cron.schedule('*/5 * * * *', async () => {
  console.log('Syncing external data...')

  const result = await scope.exec(syncExternalData, {})

  if (!result.success) {
    console.error('Sync failed:', result.reason)
    return
  }

  console.log(`Synced ${result.count} records`)
})

const shutdown = async () => {
  console.log('Shutting down job runner...')
  await scope.dispose()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('Job runner started')
```

**Key points:**
- ✅ One scope for all scheduled jobs
- ✅ Resources shared (efficient connection pooling)
- ✅ Jobs isolated via flow execution
- ✅ Dispose on shutdown
- ❌ Don't create scope per job execution
- ❌ Don't create scope inside job callback

---

### Backend: Event Processors (Kafka, Message Queues)

**Scope lifecycle:** ONE scope for entire consumer lifetime.

**Pattern:**
- Create scope when consumer starts
- Reuse scope for all message processing
- Messages processed via flows
- Dispose when consumer stops

**Example (Kafka consumer):**

```typescript
import { Kafka } from 'kafkajs'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { processOrderCreated, processUserRegistered, processPaymentCompleted } from './flows'

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
      database: process.env.DB_NAME || 'app',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    })
  ]
})

await consumer.connect()
await consumer.subscribe({ topic: 'orders', fromBeginning: false })
await consumer.subscribe({ topic: 'users', fromBeginning: false })
await consumer.subscribe({ topic: 'payments', fromBeginning: false })

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const key = message.key?.toString()
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

        case 'payments': {
          const result = await scope.exec(processPaymentCompleted, {
            paymentId: value.paymentId,
            orderId: value.orderId,
            amount: value.amount
          })

          if (!result.success) {
            console.error(`Payment processing failed: ${result.reason}`)
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

console.log('Consumer started')
```

**Example (SQS queue consumer):**

```typescript
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { processQueueMessage } from './flows'

const sqsClient = new SQSClient({ region: 'us-east-1' })
const queueUrl = process.env.QUEUE_URL!

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

let running = true

const pollQueue = async () => {
  while (running) {
    try {
      const response = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20
      }))

      if (!response.Messages) continue

      for (const message of response.Messages) {
        const body = JSON.parse(message.Body || '{}')

        const result = await scope.exec(processQueueMessage, {
          messageId: message.MessageId!,
          data: body
        })

        if (result.success) {
          await sqsClient.send(new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle!
          }))
        } else {
          console.error(`Message processing failed: ${result.reason}`)
        }
      }
    } catch (error) {
      console.error('Queue polling error:', error)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

const shutdown = async () => {
  console.log('Shutting down queue consumer...')
  running = false
  await scope.dispose()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

pollQueue()
console.log('Queue consumer started')
```

**Key points:**
- ✅ One scope for consumer lifetime
- ✅ Resources shared across messages
- ✅ Each message processed via flow
- ✅ Error handling per message (don't crash consumer)
- ❌ Don't create scope per message
- ❌ Don't let errors kill consumer

---

### Frontend: React SPA

**Scope lifecycle:** ONE scope for entire application lifetime.

**Pattern:**
- Create scope at app root
- Provide via React Context (ScopeProvider)
- All components use same scope
- Dispose on unmount (rare, usually never)

**Example (React with @pumped-fn/react):**

```typescript
import { useMemo } from 'react'
import { createScope } from '@pumped-fn/core-next'
import { ScopeProvider } from '@pumped-fn/react'
import { apiUrl, apiKey } from './resources'
import { AppRoutes } from './routes'

export function App() {
  const scope = useMemo(() => createScope({
    tags: [
      apiUrl(import.meta.env.VITE_API_URL || 'http://localhost:3000'),
      apiKey(import.meta.env.VITE_API_KEY || '')
    ]
  }), [])

  return (
    <ScopeProvider value={scope}>
      <AppRoutes />
    </ScopeProvider>
  )
}
```

**Using flows in components:**

```typescript
import { useFlow } from '@pumped-fn/react'
import { createUser } from '../flows'

export function UserForm() {
  const [createUserFn, { loading, error }] = useFlow(createUser)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const result = await createUserFn({
      email: formData.get('email') as string,
      name: formData.get('name') as string
    })

    if (result.success) {
      alert('User created!')
    } else {
      alert(`Error: ${result.reason}`)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="name" type="text" required />
      <button disabled={loading}>Create User</button>
      {error && <p>Error: {error.message}</p>}
    </form>
  )
}
```

**Using derived resources in components:**

```typescript
import { useExecutor } from '@pumped-fn/react'
import { currentUser } from '../resources'

export function UserProfile() {
  const user = useExecutor(currentUser)

  if (!user) {
    return <p>Loading...</p>
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}
```

**Key points:**
- ✅ One scope created at app root via useMemo
- ✅ Provided via ScopeProvider context
- ✅ Components use useFlow/useExecutor hooks
- ✅ Scope shared across all components
- ❌ Don't create scope in child components
- ❌ Don't create scope without useMemo

---

### Frontend: Meta-frameworks (Next.js, TanStack Start)

**Scope lifecycle:** Module-level scope, injected via middleware.

**Pattern:**
- Create scope at module level (singleton)
- Attach to request context via middleware
- Server components/actions use context scope
- Dispose on server shutdown (rarely needed)

**Example (Next.js App Router):**

```typescript
// src/lib/scope.ts
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey } from '@/resources'

export const appScope = createScope({
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

```typescript
// src/app/users/page.tsx (Server Component)
import { appScope } from '@/lib/scope'
import { listUsers } from '@/flows'

export default async function UsersPage() {
  const result = await appScope.exec(listUsers, {})

  if (!result.success) {
    return <div>Error: {result.reason}</div>
  }

  return (
    <div>
      <h1>Users</h1>
      <ul>
        {result.users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

**Example (TanStack Start):**

```typescript
// src/lib/scope.ts
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from '@/resources'

export const appScope = createScope({
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
```

```typescript
// src/routes/users.tsx
import { createFileRoute } from '@tanstack/react-router'
import { appScope } from '@/lib/scope'
import { listUsers } from '@/flows'

export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  },
  component: UsersPage
})

function UsersPage() {
  const { users } = Route.useLoaderData()

  return (
    <div>
      <h1>Users</h1>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

**Key points:**
- ✅ Module-level scope (singleton)
- ✅ Import scope where needed
- ✅ Use in server components, API routes, loaders
- ✅ Never dispose (long-running server)
- ❌ Don't create scope per request
- ❌ Don't use in client components (use API calls instead)

---

### Serverless: Lambda / Edge Functions

**Scope lifecycle:** ONE scope PER INVOCATION.

**Pattern:**
- Create scope at handler start
- Execute business logic
- Dispose via finally
- Cold start creates resources once

**Example (AWS Lambda):**

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser, getUser } from './flows'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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

    if (event.httpMethod === 'GET' && event.path.startsWith('/users/')) {
      const id = event.path.split('/')[2]

      const result = await scope.exec(getUser, { id })

      if (!result.success) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: result.reason })
        }
      }

      return {
        statusCode: 200,
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

**Example (Cloudflare Workers):**

```typescript
import { createScope } from '@pumped-fn/core-next'
import { apiKey } from './resources'
import { processRequest } from './flows'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const scope = createScope({
      tags: [
        apiKey(env.API_KEY)
      ]
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

**Example (Vercel Edge Functions):**

```typescript
import { createScope } from '@pumped-fn/core-next'
import { apiUrl } from './resources'
import { fetchData } from './flows'

export const config = {
  runtime: 'edge'
}

export default async function handler(request: Request) {
  const scope = createScope({
    tags: [
      apiUrl(process.env.API_URL!)
    ]
  })

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query) {
      return Response.json({ error: 'Missing query' }, { status: 400 })
    }

    const result = await scope.exec(fetchData, { query })

    if (!result.success) {
      return Response.json({ error: result.reason }, { status: 500 })
    }

    return Response.json(result.data)
  } finally {
    await scope.dispose()
  }
}
```

**Key points:**
- ✅ New scope per invocation
- ✅ Always dispose in finally
- ✅ Cold start overhead acceptable (resources cached)
- ✅ Stateless (no shared scope across invocations)
- ❌ Don't create global scope (breaks serverless model)
- ❌ Don't forget finally block (memory leaks)

---

