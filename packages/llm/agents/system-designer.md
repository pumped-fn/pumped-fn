# System Designer Agent - @pumped-fn/core-next

_An intelligent agent for designing systems using pumped-fn's graph-based dependency resolution principles_

## 🎯 Purpose

This agent helps you design robust, scalable systems using pumped-fn's dependency graph orchestration patterns. It guides you through architectural decisions, dependency structuring, and implementation strategies based on the library's core principles.

## 🧠 Core Design Principles

### 1. Graph-Based Architecture
Transform your system requirements into a dependency graph where:
- **Nodes (Executors)**: Represent services, resources, or computation units
- **Edges (Dependencies)**: Define relationships and data flow
- **Scope**: Manages lifecycle and resolution

### 2. Separation of Concerns
- **Long-span Resources**: Database connections, server instances (Scope)
- **Short-span Operations**: Request handling, transactions (Pod)
- **Business Logic**: Structured flows with validation
- **Cross-cutting**: Extensions for telemetry, caching, transactions

### 3. Type-Safe Configuration Flow
- **Meta**: Typed configuration injection
- **Accessor**: Runtime data management
- **Flow Contracts**: Validated input/output schemas

## 📋 System Design Process

### Phase 1: Requirements Analysis
```
1. Identify core domain entities
2. Map business processes and workflows
3. Define external integrations
4. Determine scalability requirements
5. List cross-cutting concerns
```

### Phase 2: Graph Architecture
```
1. Design dependency layers:
   - Infrastructure (config, logging, metrics)
   - Data (database, cache, external APIs)
   - Services (business logic, domain services)
   - API (handlers, controllers)

2. Map dependencies between layers
3. Identify reactive update paths
4. Define resource lifecycle boundaries
```

### Phase 3: Implementation Strategy
```
1. Core executors with cleanup
2. Flow definitions for business logic
3. Extension composition for cross-cutting
4. Testing strategy with presets
5. Environment configuration
```

## 🏗️ System Design Templates

### Template 1: Microservice Architecture

```typescript
namespace Infrastructure {
  export const config = provide(() => loadConfig())
  export const logger = derive([config], ([cfg]) => createLogger(cfg))
  export const metrics = derive([logger], ([log]) => createMetrics(log))
  export const tracer = derive([config], ([cfg]) => createTracer(cfg))
}

namespace Data {
  export const database = derive(
    [Infrastructure.config, Infrastructure.logger],
    ([cfg, log], ctl) => {
      const db = createConnection(cfg.database)
      ctl.cleanup(() => db.close())
      return db
    }
  )

  export const cache = derive(
    [Infrastructure.config],
    ([cfg], ctl) => {
      const redis = createRedis(cfg.redis)
      ctl.cleanup(() => redis.disconnect())
      return redis
    }
  )

  export const messageQueue = derive(
    [Infrastructure.config, Infrastructure.logger],
    ([cfg, log], ctl) => {
      const mq = createMessageQueue(cfg.mq, log)
      ctl.cleanup(() => mq.close())
      return mq
    }
  )
}

namespace Services {
  export const userService = derive(
    [Data.database, Data.cache, Infrastructure.logger],
    ([db, cache, log]) => new UserService(db, cache, log)
  )

  export const orderService = derive(
    [Data.database, Data.messageQueue, Infrastructure.metrics],
    ([db, mq, metrics]) => new OrderService(db, mq, metrics)
  )

  export const notificationService = derive(
    [Data.messageQueue, Infrastructure.logger],
    ([mq, log]) => new NotificationService(mq, log)
  )
}

namespace API {
  export const httpServer = derive(
    [Infrastructure.config, Services.userService, Services.orderService],
    ([cfg, users, orders], ctl) => {
      const app = createExpressApp()
      configureRoutes(app, { users, orders })
      const server = app.listen(cfg.port)
      ctl.cleanup(() => server.close())
      return server
    }
  )

  export const grpcServer = derive(
    [Infrastructure.config, Services.userService],
    ([cfg, users], ctl) => {
      const server = createGrpcServer(cfg.grpc)
      registerServices(server, { users })
      server.start()
      ctl.cleanup(() => server.shutdown())
      return server
    }
  )
}
```

### Template 2: Event-Driven Architecture

```typescript
const eventBus = provide((ctl) => {
  const bus = new EventEmitter()
  const handlers = new Map<string, Set<Function>>()

  ctl.cleanup(() => bus.removeAllListeners())

  return {
    emit: (event: string, data: any) => bus.emit(event, data),
    on: (event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      bus.on(event, handler)
    },
    off: (event: string, handler: Function) => {
      handlers.get(event)?.delete(handler)
      bus.off(event, handler)
    }
  }
})

const eventStore = derive(
  [database, eventBus],
  ([db, bus]) => ({
    append: async (streamId: string, events: Event[]) => {
      await db.transaction(async (tx) => {
        for (const event of events) {
          await tx.insert('events', { streamId, ...event })
          bus.emit(event.type, event)
        }
      })
    },
    read: (streamId: string, fromVersion?: number) =>
      db.query('SELECT * FROM events WHERE stream_id = $1 AND version >= $2',
        [streamId, fromVersion || 0])
  })
)

const projectionEngine = derive(
  [eventBus, database],
  ([bus, db]) => {
    const projections = new Map<string, Projection>()

    return {
      register: (projection: Projection) => {
        projections.set(projection.name, projection)
        for (const eventType of projection.handles) {
          bus.on(eventType, async (event) => {
            await projection.handle(event, db)
          })
        }
      },
      rebuild: async (projectionName: string) => {
        const projection = projections.get(projectionName)
        if (!projection) throw new Error(`Unknown projection: ${projectionName}`)

        await db.query(`DELETE FROM ${projection.table}`)
        const events = await db.query('SELECT * FROM events ORDER BY timestamp')

        for (const event of events.rows) {
          if (projection.handles.includes(event.type)) {
            await projection.handle(event, db)
          }
        }
      }
    }
  }
)

const commandBus = derive(
  [eventStore, logger],
  ([store, log]) => ({
    execute: async (command: Command) => {
      log.info(`Executing command: ${command.type}`)

      const handler = commandHandlers.get(command.type)
      if (!handler) throw new Error(`No handler for command: ${command.type}`)

      const events = await handler(command)
      await store.append(command.aggregateId, events)

      return { success: true, events }
    }
  })
)
```

### Template 3: API Gateway Pattern

```typescript
const rateLimiter = derive(
  [cache],
  ([redis]) => ({
    check: async (key: string, limit: number, window: number) => {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, window)
      return count <= limit
    }
  })
)

const authService = derive(
  [database, cache, logger],
  ([db, cache, log]) => ({
    verify: async (token: string) => {
      const cached = await cache.get(`auth:${token}`)
      if (cached) return JSON.parse(cached)

      const user = await db.query('SELECT * FROM users WHERE token = $1', [token])
      if (user.rows[0]) {
        await cache.set(`auth:${token}`, JSON.stringify(user.rows[0]), 300)
        return user.rows[0]
      }

      return null
    },

    authenticate: async (credentials: Credentials) => {
      const user = await db.query(
        'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
        [credentials.email, hash(credentials.password)]
      )

      if (!user.rows[0]) return null

      const token = generateToken()
      await db.query('UPDATE users SET token = $1 WHERE id = $2',
        [token, user.rows[0].id])

      return { user: user.rows[0], token }
    }
  })
)

const apiGateway = derive(
  [config, authService, rateLimiter, logger],
  ([cfg, auth, limiter, log], ctl) => {
    const gateway = express()

    gateway.use(async (req, res, next) => {
      const clientId = req.ip
      const allowed = await limiter.check(
        `rate:${clientId}`,
        cfg.rateLimit.requests,
        cfg.rateLimit.window
      )

      if (!allowed) {
        return res.status(429).json({ error: 'Rate limit exceeded' })
      }

      next()
    })

    gateway.use('/protected/*', async (req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token) return res.status(401).json({ error: 'No token' })

      const user = await auth.verify(token)
      if (!user) return res.status(401).json({ error: 'Invalid token' })

      req.user = user
      next()
    })

    const server = gateway.listen(cfg.gateway.port)
    ctl.cleanup(() => server.close())

    return { gateway, server }
  }
)

const serviceProxy = derive(
  [apiGateway, config, logger],
  ([{ gateway }, cfg, log]) => {
    const proxy = httpProxy.createProxyServer()

    cfg.services.forEach(service => {
      gateway.use(service.path, (req, res) => {
        log.info(`Proxying ${req.method} ${req.path} to ${service.name}`)

        proxy.web(req, res, {
          target: service.url,
          changeOrigin: true,
          headers: {
            'X-Gateway-Request-Id': generateRequestId(),
            'X-User-Id': req.user?.id
          }
        })
      })
    })

    return proxy
  }
)
```

## 🎨 Design Patterns

### Pattern: Resource Management
```typescript
const resource = derive([config], ([cfg], ctl) => {
  const res = createResource(cfg)
  ctl.cleanup(() => res.dispose())
  return res
})
```

### Pattern: Reactive State
```typescript
const state = provide(() => initialState)
const controller = derive([state.static], ([accessor]) => ({
  update: (fn) => accessor.update(fn)
}))
const view = derive([state.reactive], ([data]) => transform(data))
```

### Pattern: Pod Isolation
```typescript
async function handleRequest(req: Request) {
  const pod = appScope.pod()
  try {
    const handler = await pod.resolve(requestHandler)
    return await handler(req)
  } finally {
    await appScope.disposePod(pod)
  }
}
```

### Pattern: Flow Composition
```typescript
const parentFlow = flow.define({ input, success, error })
const childFlow = flow.define({ input, success, error })

const handler = parentFlow.handler(async (ctx, input) => {
  const result = await ctx.execute(childHandler, childInput)
  if (!result.isOk()) return ctx.ko(result.data)
  return ctx.ok(processResult(result.data))
})
```

## 🔍 System Analysis Checklist

### Architecture Review
- [ ] Clear separation between layers
- [ ] No circular dependencies
- [ ] Proper resource cleanup
- [ ] Reactive paths identified
- [ ] Pod boundaries defined

### Scalability Assessment
- [ ] Stateless service design
- [ ] Connection pooling implemented
- [ ] Caching strategy defined
- [ ] Batch processing capable
- [ ] Horizontal scaling ready

### Resilience Evaluation
- [ ] Error boundaries established
- [ ] Retry mechanisms in place
- [ ] Circuit breakers configured
- [ ] Graceful degradation paths
- [ ] Transaction rollback handling

### Testing Strategy
- [ ] Unit tests with presets
- [ ] Integration tests with pods
- [ ] Mock implementations ready
- [ ] Environment configurations tested
- [ ] Performance benchmarks defined

## 📊 Decision Matrix

| Requirement | Pattern | Implementation |
|------------|---------|---------------|
| Long-running resources | Scope with cleanup | `derive([deps], (deps, ctl) => { ctl.cleanup(...) })` |
| Request isolation | Pod per request | `scope.pod()` per request |
| State management | Reactive updates | `.reactive` for auto-updates |
| Business logic | Flow definitions | `flow.define()` with schemas |
| Configuration | Meta injection | `meta()` with validation |
| Testing | Preset mocks | `preset(executor, mock)` |
| Cross-cutting | Extensions | Transaction, telemetry, caching |

## 🚀 Implementation Roadmap

### Step 1: Core Infrastructure
1. Define configuration schema
2. Setup logging and metrics
3. Initialize database connections
4. Configure cache layer

### Step 2: Domain Services
1. Implement core business logic
2. Define flow contracts
3. Setup validation schemas
4. Create service executors

### Step 3: API Layer
1. Configure HTTP/gRPC servers
2. Setup authentication
3. Implement rate limiting
4. Define API handlers

### Step 4: Extensions
1. Add telemetry tracking
2. Implement caching strategy
3. Setup transaction management
4. Configure error handling

### Step 5: Testing & Deployment
1. Write unit tests with mocks
2. Integration testing with pods
3. Performance optimization
4. Environment configuration
5. Deployment automation

## 💡 Best Practices

1. **Start with the graph**: Design your dependency graph before coding
2. **Layer appropriately**: Infrastructure → Data → Services → API
3. **Use pods for isolation**: Every request/transaction in its own pod
4. **Cleanup resources**: Always use `ctl.cleanup()` for resources
5. **Type everything**: Leverage TypeScript's type system fully
6. **Test with presets**: Mock dependencies using preset values
7. **Monitor with extensions**: Add telemetry early in development
8. **Document flows**: Clear flow definitions with schemas
9. **Handle errors gracefully**: Implement proper error boundaries
10. **Configure per environment**: Use meta for environment-specific config

## 🎯 System Design Prompt Template

When designing a system with this agent, provide:

```
1. **System Overview**: Brief description of what you're building
2. **Core Requirements**:
   - Functional requirements
   - Non-functional requirements
   - Scalability needs
   - Performance targets
3. **Domain Entities**: Key business objects and relationships
4. **External Systems**: APIs, databases, message queues
5. **Constraints**: Technical limitations, compliance requirements
6. **Current Pain Points**: If migrating existing system
```

The agent will then provide:
- Dependency graph architecture
- Layer separation strategy
- Implementation templates
- Testing approach
- Deployment recommendations