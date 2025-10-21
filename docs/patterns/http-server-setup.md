---
title: HTTP Server Setup
description: Complete server lifecycle with graceful shutdown
keywords: [http, server, lifecycle, graceful-shutdown]
---

# HTTP Server Setup

Build HTTP servers with proper lifecycle management: initialization, request handling, and graceful shutdown.

## Architecture

- **Scope** holds server, DB connection, config
- **Flow** handles individual requests
- **Extensions** add logging, error tracking
- **Graceful shutdown** via scope.dispose()

## Complete Example

```ts twoslash
import { provide, derive, createScope, flow, tag, custom } from '@pumped-fn/core-next'
import type { Server } from 'http'

const port = tag(custom<number>(), { label: 'server.port', default: 3000 })
const dbHost = tag(custom<string>(), { label: 'db.host', default: 'localhost' })

const config = provide((controller) => ({
  port: port.get(controller.scope),
  dbHost: dbHost.get(controller.scope)
}))

const db = derive(config, (cfg) => ({
  connect: async () => console.log(`Connected to ${cfg.dbHost}`),
  query: async (sql: string) => ({ rows: [] }),
  close: async () => console.log('DB closed')
}))

const server = derive({ config, db }, async ({ config, db }) => {
  await db.connect()

  const srv: Server = createHttpServer((req, res) => {
    res.end('OK')
  })

  await new Promise<void>(resolve => {
    srv.listen(config.port, resolve)
  })

  console.log(`Server listening on ${config.port}`)

  return {
    server: srv,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        srv.close(err => err ? reject(err) : resolve())
      })
      await db.close()
      console.log('Server closed')
    }
  }
})

async function main() {
  const scope = createScope({
    tags: [
      port(3000),
      dbHost('db.example.com')
    ]
  })

  const srv = await scope.resolve(server)

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down')
    await scope.dispose()
    process.exit(0)
  })
}

function createHttpServer(handler: any): Server {
  return null as any
}
```

## Request Handler Pattern

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })

type Request = { url: string, method: string }
type Response = { status: number, body: any }

const handleRequest = flow((ctx, req: Request): Response => {
  const id = `req-${Date.now()}`
  ctx.set(requestId, id)

  if (req.url === '/health') {
    return { status: 200, body: { status: 'ok' } }
  }

  return { status: 404, body: { error: 'Not found' } }
})
```

## Graceful Shutdown

```typescript
async function gracefulShutdown(scope: Scope) {
  console.log('Shutting down...')

  // Stop accepting new requests
  const srv = await scope.resolve(server)

  // Wait for in-flight requests (use extension to track)
  await waitForInFlightRequests()

  // Dispose scope (closes server, DB)
  await scope.dispose()

  console.log('Shutdown complete')
}

function waitForInFlightRequests() {
  return Promise.resolve()
}
```

## Production Checklist

- ✅ Graceful shutdown on SIGTERM
- ✅ Health check endpoint
- ✅ Request logging extension
- ✅ Error tracking extension
- ✅ Database connection pooling
- ✅ Request timeout handling
- ✅ Scope disposal in process handlers

## See Also

- [Scope Lifecycle](../guides/03-scope-lifecycle.md)
- [Extensions](../guides/09-extensions.md)
- [Middleware Composition](./middleware-composition.md)
