# Production Examples - @pumped-fn/core-next

_Complete working implementations for real-world scenarios_

## Application Bootstrap

### Complete Server Application with Configuration

```typescript
import { createScope, provide, derive, meta, custom, name, preset } from "@pumped-fn/core-next"
import * as errors from "@pumped-fn/core-next"
import express from "express"
import { z } from "zod"

const configMeta = meta("app.config", z.object({
  port: z.number().min(1).max(65535),
  host: z.string(),
  environment: z.enum(["development", "staging", "production"]),
  database: z.object({
    url: z.string().url(),
    poolSize: z.number().min(1).max(100)
  })
}))

const config = provide((ctl) => {
  const env = process.env.NODE_ENV || "development"

  ctl.cleanup(() => console.log("Config cleanup"))

  return {
    port: parseInt(process.env.PORT || "3000"),
    host: process.env.HOST || "0.0.0.0",
    environment: env as any,
    database: {
      url: process.env.DATABASE_URL || "postgres://localhost:5432/myapp",
      poolSize: env === "production" ? 50 : 5
    }
  }
})

const database = derive([config], async ([cfg], ctl) => {
  const pool = new Pool({ connectionString: cfg.database.url, max: cfg.database.poolSize })

  await pool.connect()
  console.log(`Database connected: ${cfg.database.url}`)

  ctl.cleanup(async () => {
    await pool.end()
    console.log("Database pool closed")
  })

  return pool
})

const logger = derive([config], ([cfg]) => {
  const level = cfg.environment === "production" ? "info" : "debug"

  return {
    debug: (msg: string, meta?: any) => {
      if (level === "debug") console.log(`[DEBUG] ${msg}`, meta)
    },
    info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta),
    error: (msg: string, error?: any) => console.error(`[ERROR] ${msg}`, error)
  }
})

const healthCheck = derive([database], ([db]) => {
  return async () => {
    try {
      await db.query("SELECT 1")
      return { status: "healthy", timestamp: new Date() }
    } catch (error) {
      return { status: "unhealthy", error: error.message, timestamp: new Date() }
    }
  }
})

const server = derive([config, logger, healthCheck], ([cfg, log, health]) => {
  const app = express()

  app.get("/health", async (req, res) => {
    const status = await health()
    res.status(status.status === "healthy" ? 200 : 503).json(status)
  })

  app.use((err: Error, req: any, res: any, next: any) => {
    log.error("Request error", err)
    res.status(500).json({ error: "Internal server error" })
  })

  const server = app.listen(cfg.port, cfg.host, () => {
    log.info(`Server started on http://${cfg.host}:${cfg.port}`)
  })

  return { app, server }
})

async function bootstrap() {
  const scope = createScope({
    meta: [
      configMeta({
        port: 3000,
        host: "0.0.0.0",
        environment: "development",
        database: {
          url: process.env.DATABASE_URL || "postgres://localhost:5432/myapp",
          poolSize: 5
        }
      }),
      name(config)("app.config"),
      name(database)("app.database"),
      name(logger)("app.logger"),
      name(server)("app.server")
    ]
  })

  scope.onError((error, executor) => {
    const executorName = errors.getExecutorName(executor)
    console.error(`Error in ${executorName}:`, error)

    if (error instanceof errors.DependencyResolutionError) {
      console.error("Dependency chain:", errors.buildDependencyChain(error.resolutionStack))
    }
  })

  try {
    await scope.resolve(server)

    process.on("SIGTERM", async () => {
      console.log("SIGTERM received, graceful shutdown...")
      await scope.dispose()
      process.exit(0)
    })
  } catch (error) {
    console.error("Bootstrap failed:", error)
    await scope.dispose()
    process.exit(1)
  }
}

bootstrap()
```

## Order Processing System

### Complete E-commerce Order Flow

```typescript
import { flow, createScope, derive, provide, custom, accessor } from "@pumped-fn/core-next"
import { z } from "zod"

const Context = {
  TRACE_ID: accessor("trace.id", custom<string>()),
  USER_ID: accessor("user.id", custom<string>()),
  DB_TRANSACTION: accessor("db.transaction", custom<Transaction>())
}

const orderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive()
  })).min(1),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string(),
    zipCode: z.string()
  }),
  paymentMethod: z.object({
    type: z.enum(["card", "paypal", "bank_transfer"]),
    details: z.record(z.string())
  })
})

const orderFlow = flow.define({
  name: "order.process",
  input: orderSchema,
  success: custom<{
    orderId: string
    trackingNumber: string
    estimatedDelivery: Date
    receipt: { url: string; total: number }
  }>(),
  error: custom<{
    code: "PAYMENT_FAILED" | "OUT_OF_STOCK" | "SHIPPING_UNAVAILABLE" | "SYSTEM_ERROR"
    message: string
    details?: any
    refundStatus?: "initiated" | "completed" | "not_required"
  }>()
})

const validateInventory = flow.define({
  name: "inventory.validate",
  input: custom<{ items: Array<{ productId: string; quantity: number }> }>(),
  success: custom<{ reservationId: string }>(),
  error: custom<{ code: "OUT_OF_STOCK"; items: string[] }>()
})

const processPayment = flow.define({
  name: "payment.process",
  input: custom<{
    amount: number
    customerId: string
    method: { type: string; details: Record<string, string> }
  }>(),
  success: custom<{ transactionId: string; receipt: string }>(),
  error: custom<{ code: "PAYMENT_FAILED"; reason: string }>()
})

const createShipment = flow.define({
  name: "shipment.create",
  input: custom<{
    orderId: string
    address: any
    items: any[]
  }>(),
  success: custom<{ trackingNumber: string; estimatedDelivery: Date }>(),
  error: custom<{ code: "SHIPPING_UNAVAILABLE"; reason: string }>()
})

const inventoryService = provide(() => ({
  reserve: async (items: any[]) => {
    const unavailable = items.filter(i => Math.random() > 0.9)
    if (unavailable.length > 0) {
      throw new Error(`Out of stock: ${unavailable.map(i => i.productId).join(", ")}`)
    }
    return { reservationId: `RES-${Date.now()}` }
  },
  release: async (reservationId: string) => {
    console.log(`Released reservation: ${reservationId}`)
  }
}))

const paymentGateway = provide(() => ({
  charge: async (amount: number, method: any) => {
    if (Math.random() > 0.95) {
      throw new Error("Payment gateway timeout")
    }
    return {
      transactionId: `TXN-${Date.now()}`,
      receipt: `https://receipts.example.com/${Date.now()}`
    }
  },
  refund: async (transactionId: string) => {
    console.log(`Refunded: ${transactionId}`)
    return { refundId: `REF-${Date.now()}` }
  }
}))

const shippingService = provide(() => ({
  createLabel: async (shipment: any) => {
    return {
      trackingNumber: `TRACK-${Date.now()}`,
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    }
  }
}))

const orderDatabase = derive([database], ([db]) => ({
  create: async (order: any) => {
    const result = await db.query(
      "INSERT INTO orders (customer_id, total, status) VALUES ($1, $2, $3) RETURNING id",
      [order.customerId, order.total, "pending"]
    )
    return result.rows[0].id
  },
  updateStatus: async (orderId: string, status: string, metadata?: any) => {
    await db.query(
      "UPDATE orders SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3",
      [status, JSON.stringify(metadata), orderId]
    )
  }
}))

const inventoryHandler = validateInventory.handler(
  { inventory: inventoryService },
  async ({ inventory }, ctx, input) => {
    const traceId = Context.TRACE_ID.find(ctx)
    console.log(`[${traceId}] Validating inventory for ${input.items.length} items`)

    try {
      const reservation = await inventory.reserve(input.items)
      return ctx.ok(reservation)
    } catch (error) {
      return ctx.ko({
        code: "OUT_OF_STOCK",
        items: error.message.replace("Out of stock: ", "").split(", ")
      })
    }
  }
)

const paymentHandler = processPayment.handler(
  { gateway: paymentGateway, logger },
  async ({ gateway, logger }, ctx, input) => {
    logger.info("Processing payment", { amount: input.amount, customerId: input.customerId })

    try {
      const result = await gateway.charge(input.amount, input.method)
      return ctx.ok({
        transactionId: result.transactionId,
        receipt: result.receipt
      })
    } catch (error) {
      logger.error("Payment failed", error)
      return ctx.ko({
        code: "PAYMENT_FAILED",
        reason: error.message
      })
    }
  }
)

const shipmentHandler = createShipment.handler(
  { shipping: shippingService },
  async ({ shipping }, ctx, input) => {
    try {
      const label = await shipping.createLabel(input)
      return ctx.ok(label)
    } catch (error) {
      return ctx.ko({
        code: "SHIPPING_UNAVAILABLE",
        reason: error.message
      })
    }
  }
)

const orderHandler = orderFlow.handler(
  {
    db: orderDatabase,
    inventory: inventoryService,
    payment: paymentGateway,
    logger
  },
  async ({ db, inventory, payment, logger }, ctx, input) => {
    const traceId = Context.TRACE_ID.get(ctx)
    logger.info(`Processing order [${traceId}]`, { customerId: input.customerId })

    let orderId: string
    let reservationId: string | undefined
    let transactionId: string | undefined

    try {
      const inventoryResult = await ctx.execute(inventoryHandler, { items: input.items })
      if (!inventoryResult.isOk()) {
        return ctx.ko({
          code: "OUT_OF_STOCK",
          message: `Items unavailable: ${inventoryResult.data.items.join(", ")}`,
          details: inventoryResult.data
        })
      }
      reservationId = inventoryResult.data.reservationId

      const total = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      orderId = await db.create({
        customerId: input.customerId,
        total,
        items: input.items
      })

      const paymentResult = await ctx.execute(paymentHandler, {
        amount: total,
        customerId: input.customerId,
        method: input.paymentMethod
      })

      if (!paymentResult.isOk()) {
        await inventory.release(reservationId)
        await db.updateStatus(orderId, "payment_failed")
        return ctx.ko({
          code: "PAYMENT_FAILED",
          message: paymentResult.data.reason,
          details: paymentResult.data,
          refundStatus: "not_required"
        })
      }
      transactionId = paymentResult.data.transactionId

      const shipmentResult = await ctx.execute(shipmentHandler, {
        orderId,
        address: input.shippingAddress,
        items: input.items
      })

      if (!shipmentResult.isOk()) {
        await payment.refund(transactionId)
        await inventory.release(reservationId)
        await db.updateStatus(orderId, "shipping_failed")
        return ctx.ko({
          code: "SHIPPING_UNAVAILABLE",
          message: shipmentResult.data.reason,
          details: shipmentResult.data,
          refundStatus: "completed"
        })
      }

      await db.updateStatus(orderId, "completed", {
        transactionId,
        trackingNumber: shipmentResult.data.trackingNumber
      })

      logger.info(`Order completed [${traceId}]`, { orderId })

      return ctx.ok({
        orderId,
        trackingNumber: shipmentResult.data.trackingNumber,
        estimatedDelivery: shipmentResult.data.estimatedDelivery,
        receipt: {
          url: paymentResult.data.receipt,
          total
        }
      })

    } catch (error) {
      logger.error(`Order processing failed [${traceId}]`, error)

      if (transactionId) {
        await payment.refund(transactionId)
      }
      if (reservationId) {
        await inventory.release(reservationId)
      }
      if (orderId) {
        await db.updateStatus(orderId, "failed", { error: error.message })
      }

      return ctx.ko({
        code: "SYSTEM_ERROR",
        message: "Order processing failed due to system error",
        details: { error: error.message },
        refundStatus: transactionId ? "completed" : "not_required"
      })
    }
  }
)

const scope = createScope()
const handler = await scope.resolve(orderHandler)

const result = await flow.execute(handler, {
  customerId: "550e8400-e29b-41d4-a716-446655440000",
  items: [
    { productId: "PROD-001", quantity: 2, price: 29.99 },
    { productId: "PROD-002", quantity: 1, price: 49.99 }
  ],
  shippingAddress: {
    street: "123 Main St",
    city: "New York",
    country: "USA",
    zipCode: "10001"
  },
  paymentMethod: {
    type: "card",
    details: { last4: "1234", brand: "visa" }
  }
}, {
  scope,
  initialContext: [
    Context.TRACE_ID.preset(`trace-${Date.now()}`),
    Context.USER_ID.preset("user-123")
  ]
})

if (result.isOk()) {
  console.log("Order successful:", result.data)
} else {
  console.error("Order failed:", result.data)
}
```

## Reactive Updates Pattern

### Real-time Dashboard with Reactive Updates

```typescript
import { provide, derive, createScope, custom } from "@pumped-fn/core-next"

const metrics = provide((ctl) => {
  let data = {
    requests: 0,
    errors: 0,
    latency: 0,
    throughput: 0
  }

  const interval = setInterval(() => {
    data = {
      requests: Math.floor(Math.random() * 1000),
      errors: Math.floor(Math.random() * 50),
      latency: Math.random() * 100,
      throughput: Math.random() * 500
    }
  }, 1000)

  ctl.cleanup(() => clearInterval(interval))

  return data
})

const healthStatus = derive([metrics.reactive], ([m]) => {
  const errorRate = m.requests > 0 ? m.errors / m.requests : 0

  if (errorRate > 0.1) return "critical"
  if (errorRate > 0.05) return "warning"
  if (m.latency > 100) return "degraded"
  return "healthy"
})

const dashboard = derive(
  [metrics.reactive, healthStatus.reactive],
  ([m, status]) => {
    return {
      timestamp: new Date(),
      status,
      metrics: m,
      alerts: status !== "healthy" ? [`System status: ${status}`] : []
    }
  }
)

const scope = createScope()

const dashboardAccessor = await scope.accessor(dashboard)
dashboardAccessor.subscribe((value) => {
  console.clear()
  console.log("=== Dashboard Update ===")
  console.log(`Status: ${value.status}`)
  console.log(`Requests: ${value.metrics.requests}`)
  console.log(`Errors: ${value.metrics.errors}`)
  console.log(`Latency: ${value.metrics.latency.toFixed(2)}ms`)
  console.log(`Throughput: ${value.metrics.throughput.toFixed(2)} req/s`)
  if (value.alerts.length > 0) {
    console.log(`Alerts: ${value.alerts.join(", ")}`)
  }
})

const metricsAccessor = await scope.accessor(metrics)
setInterval(async () => {
  await metricsAccessor.update((current) => ({
    ...current,
    requests: current.requests + Math.floor(Math.random() * 100)
  }))
}, 2000)
```

## Extension Composition

### Multi-Extension System with Telemetry, Tracing, and Caching

```typescript
import { Extension, createScope, provide, derive, flow, accessor, name } from "@pumped-fn/core-next"

const TelemetryContext = {
  METRICS: accessor(Symbol.for("telemetry.metrics"), custom<Map<string, any>>(), new Map()),
  TRACE_SPANS: accessor(Symbol.for("telemetry.spans"), custom<any[]>(), [])
}

const telemetryExtension: Extension.Extension = {
  name: "telemetry",

  async init(scope) {
    console.log("Telemetry initialized")

    scope.onChange((event, executor, value) => {
      const metrics = TelemetryContext.METRICS.find(scope)
      const key = `${event}.count`
      metrics.set(key, (metrics.get(key) || 0) + 1)
    })
  },

  async wrapResolve(next, { operation, executor, scope }) {
    const executorName = name.find(executor) || "unnamed"
    const start = performance.now()

    try {
      const result = await next()
      const duration = performance.now() - start

      const metrics = TelemetryContext.METRICS.find(scope)
      const key = `${executorName}.${operation}.duration`
      const durations = metrics.get(key) || []
      durations.push(duration)
      metrics.set(key, durations)

      return result
    } catch (error) {
      const metrics = TelemetryContext.METRICS.find(scope)
      const key = `${executorName}.${operation}.errors`
      metrics.set(key, (metrics.get(key) || 0) + 1)
      throw error
    }
  },

  async wrapExecute(context, next, execution) {
    const span = {
      flowName: execution.flowName,
      depth: execution.depth,
      start: Date.now(),
      end: null as number | null,
      error: null as any
    }

    TelemetryContext.TRACE_SPANS.find(context).push(span)

    try {
      const result = await next()
      span.end = Date.now()
      return result
    } catch (error) {
      span.error = error
      span.end = Date.now()
      throw error
    }
  },

  async dispose(scope) {
    const metrics = TelemetryContext.METRICS.find(scope)
    console.log("Final telemetry metrics:", Object.fromEntries(metrics.entries()))
  }
}

const cachingExtension: Extension.Extension = {
  name: "caching",

  async wrapResolve(next, { operation, executor, scope }) {
    if (operation !== "resolve") return next()

    const cacheKey = `cache:${name.find(executor) || executor.toString()}`
    const cached = scope[Symbol.for(cacheKey)]

    if (cached !== undefined) {
      console.log(`Cache hit: ${cacheKey}`)
      return cached
    }

    const result = await next()
    scope[Symbol.for(cacheKey)] = result
    console.log(`Cache miss: ${cacheKey}`)

    return result
  }
}

const transactionExtension: Extension.Extension = {
  name: "transaction",

  async initPod(pod, context) {
    const db = await pod.resolve(database)
    const tx = await db.beginTransaction()
    context.set("db.transaction", tx)
    console.log("Transaction started")
  },

  async disposePod(pod, context) {
    const tx = context.get("db.transaction")
    if (tx) {
      await tx.commit()
      console.log("Transaction committed")
    }
  },

  onPodError(error, pod, context) {
    const tx = context.get("db.transaction")
    if (tx) {
      tx.rollback()
      console.log("Transaction rolled back due to error")
    }
  }
}

const scope = createScope({
  extensions: [telemetryExtension, cachingExtension, transactionExtension]
})

const dataService = provide(() => {
  console.log("DataService created")
  return {
    fetch: async (id: string) => ({ id, data: `Data for ${id}` })
  }
})

const processor = derive([dataService], ([service]) => {
  return async (ids: string[]) => {
    const results = []
    for (const id of ids) {
      results.push(await service.fetch(id))
    }
    return results
  }
})

await scope.resolve(processor)
const pod = scope.pod()
await pod.resolve(processor)

await scope.dispose()
```

## Testing Patterns

### Comprehensive Test Setup with Mocks and Fixtures

```typescript
import { createScope, provide, derive, preset, flow, custom } from "@pumped-fn/core-next"
import { beforeEach, afterEach, describe, test, expect, jest } from "@jest/globals"

describe("UserService Integration Tests", () => {
  let scope: Core.Scope
  let mockDb: any
  let mockCache: any
  let mockEmailService: any

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      beginTransaction: jest.fn(() => ({
        commit: jest.fn(),
        rollback: jest.fn()
      }))
    }

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      flush: jest.fn()
    }

    mockEmailService = {
      send: jest.fn(),
      sendBatch: jest.fn()
    }

    scope = createScope({
      initialValues: [
        preset(database, mockDb),
        preset(cache, mockCache),
        preset(emailService, mockEmailService)
      ]
    })
  })

  afterEach(async () => {
    await scope.dispose()
    jest.clearAllMocks()
  })

  describe("User Creation Flow", () => {
    test("creates user with email verification", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] })
      mockDb.insert.mockResolvedValueOnce({
        rows: [{ id: "user-123", email: "test@example.com" }]
      })
      mockCache.set.mockResolvedValue(true)
      mockEmailService.send.mockResolvedValue({ messageId: "msg-123" })

      const handler = await scope.resolve(createUserFlow)
      const result = await flow.execute(handler, {
        email: "test@example.com",
        password: "securePassword123",
        profile: { name: "Test User" }
      }, { scope })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.data.userId).toBe("user-123")
        expect(result.data.verificationSent).toBe(true)
      }

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        ["test@example.com"]
      )
      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockCache.set).toHaveBeenCalledWith(
        "user:user-123",
        expect.objectContaining({ email: "test@example.com" })
      )
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          template: "email-verification"
        })
      )
    })

    test("handles duplicate email error", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "existing-user", email: "test@example.com" }]
      })

      const handler = await scope.resolve(createUserFlow)
      const result = await flow.execute(handler, {
        email: "test@example.com",
        password: "password",
        profile: { name: "Test" }
      }, { scope })

      expect(result.isOk()).toBe(false)
      if (!result.isOk()) {
        expect(result.data.code).toBe("EMAIL_EXISTS")
      }

      expect(mockDb.insert).not.toHaveBeenCalled()
      expect(mockEmailService.send).not.toHaveBeenCalled()
    })
  })

  describe("Reactive Updates", () => {
    test("propagates user profile updates", async () => {
      const userProfile = provide(() => ({
        name: "Initial",
        status: "active"
      }))

      const displayName = derive([userProfile.reactive], ([profile]) => {
        return profile.status === "active" ? profile.name : `${profile.name} (inactive)`
      })

      const profileAccessor = await scope.accessor(userProfile)
      const displayAccessor = await scope.accessor(displayName)

      expect(displayAccessor.get()).toBe("Initial")

      await profileAccessor.update(p => ({ ...p, name: "Updated" }))
      expect(displayAccessor.get()).toBe("Updated")

      await profileAccessor.update(p => ({ ...p, status: "inactive" }))
      expect(displayAccessor.get()).toBe("Updated (inactive)")
    })
  })
})
```

## Parallel Execution Patterns

### Batch Processing with Parallel Flows

```typescript
import { flow, createScope, accessor, custom } from "@pumped-fn/core-next"

const ProcessingContext = {
  BATCH_ID: accessor("batch.id", custom<string>()),
  TOTAL_ITEMS: accessor("batch.total", custom<number>()),
  PROCESSED: accessor("batch.processed", custom<number>(), 0),
  FAILED: accessor("batch.failed", custom<string[]>(), [])
}

const itemProcessor = flow.define({
  name: "item.process",
  input: custom<{ id: string; data: any }>(),
  success: custom<{ id: string; result: any }>(),
  error: custom<{ id: string; error: string }>()
})

const batchProcessor = flow.define({
  name: "batch.process",
  input: custom<{ items: Array<{ id: string; data: any }> }>(),
  success: custom<{
    batchId: string
    processed: number
    failed: number
    results: Array<{ id: string; result?: any; error?: string }>
  }>(),
  error: custom<{ message: string }>()
})

const itemHandler = itemProcessor.handler(async (ctx, input) => {
  const batchId = ProcessingContext.BATCH_ID.get(ctx)
  console.log(`Processing item ${input.id} in batch ${batchId}`)

  try {
    await new Promise(r => setTimeout(r, Math.random() * 100))

    if (Math.random() > 0.8) {
      throw new Error(`Random failure for ${input.id}`)
    }

    const processed = ProcessingContext.PROCESSED.find(ctx)
    ProcessingContext.PROCESSED.set(ctx, processed + 1)

    return ctx.ok({ id: input.id, result: { processed: true, data: input.data } })
  } catch (error) {
    const failed = ProcessingContext.FAILED.find(ctx)
    ProcessingContext.FAILED.set(ctx, [...failed, input.id])

    return ctx.ko({ id: input.id, error: error.message })
  }
})

const batchHandler = batchProcessor.handler(async (ctx, input) => {
  const batchId = `BATCH-${Date.now()}`
  ProcessingContext.BATCH_ID.set(ctx, batchId)
  ProcessingContext.TOTAL_ITEMS.set(ctx, input.items.length)

  console.log(`Starting batch ${batchId} with ${input.items.length} items`)

  const chunks = []
  const chunkSize = 5

  for (let i = 0; i < input.items.length; i += chunkSize) {
    chunks.push(input.items.slice(i, i + chunkSize))
  }

  const allResults = []

  for (const chunk of chunks) {
    console.log(`Processing chunk of ${chunk.length} items in parallel`)

    const chunkResults = await ctx.executeParallel(
      chunk.map(item => [itemHandler, item] as const)
    )

    if (chunkResults.type === "all-success") {
      allResults.push(...chunkResults.data.map((r, i) => ({
        id: chunk[i].id,
        result: r.isOk() ? r.data.result : undefined,
        error: !r.isOk() ? r.data.error : undefined
      })))
    } else {
      for (let i = 0; i < chunk.length; i++) {
        const result = chunkResults.data[i]
        if (result.status === "fulfilled") {
          const output = result.value
          allResults.push({
            id: chunk[i].id,
            result: output.isOk() ? output.data.result : undefined,
            error: !output.isOk() ? output.data.error : undefined
          })
        } else {
          allResults.push({
            id: chunk[i].id,
            error: result.reason?.message || "Unknown error"
          })
        }
      }
    }
  }

  const processed = ProcessingContext.PROCESSED.get(ctx)
  const failed = ProcessingContext.FAILED.get(ctx)

  return ctx.ok({
    batchId,
    processed,
    failed: failed.length,
    results: allResults
  })
})

const scope = createScope()
const handler = await scope.resolve(batchHandler)

const testItems = Array.from({ length: 20 }, (_, i) => ({
  id: `ITEM-${i + 1}`,
  data: { value: Math.random() * 100 }
}))

const result = await flow.execute(handler, { items: testItems }, { scope })

if (result.isOk()) {
  console.log(`\nBatch completed:`)
  console.log(`- Batch ID: ${result.data.batchId}`)
  console.log(`- Processed: ${result.data.processed}`)
  console.log(`- Failed: ${result.data.failed}`)
  console.log(`- Success rate: ${((result.data.processed / testItems.length) * 100).toFixed(1)}%`)
}
```

## Multi-Environment Configuration

### Environment-Aware Application Setup

```typescript
import { createScope, provide, derive, meta, custom, preset } from "@pumped-fn/core-next"
import { z } from "zod"

type Environment = "development" | "staging" | "production"

const envMeta = meta("app.environment", custom<Environment>())

const configFactory = (env: Environment) => {
  const configs = {
    development: {
      apiUrl: "http://localhost:3000",
      database: { host: "localhost", port: 5432, ssl: false },
      cache: { driver: "memory" as const, ttl: 60 },
      logging: { level: "debug" as const, format: "pretty" as const },
      features: { debugPanel: true, rateLimit: false }
    },
    staging: {
      apiUrl: "https://staging.example.com",
      database: { host: "staging-db.example.com", port: 5432, ssl: true },
      cache: { driver: "redis" as const, ttl: 300 },
      logging: { level: "info" as const, format: "json" as const },
      features: { debugPanel: true, rateLimit: true }
    },
    production: {
      apiUrl: "https://api.example.com",
      database: { host: "prod-db.example.com", port: 5432, ssl: true },
      cache: { driver: "redis" as const, ttl: 3600 },
      logging: { level: "warn" as const, format: "json" as const },
      features: { debugPanel: false, rateLimit: true }
    }
  }

  return configs[env]
}

const multiEnvService = derive(
  [envMeta.find.bind(envMeta)],
  ([env]) => {
    const config = configFactory(env || "development")

    return {
      config,
      isProduction: env === "production",
      isDevelopment: env === "development",
      isStaging: env === "staging",

      withEnvironment<T>(handlers: Partial<Record<Environment, () => T>>): T | undefined {
        const handler = handlers[env || "development"]
        return handler?.()
      }
    }
  }
)

function createApp(environment: Environment) {
  return createScope({
    meta: [envMeta(environment)],
    initialValues: environment === "development"
      ? [preset(rateLimiter, { limit: () => true })]
      : []
  })
}

const devScope = createApp("development")
const stagingScope = createApp("staging")
const prodScope = createApp("production")

const devService = await devScope.resolve(multiEnvService)
console.log("Dev config:", devService.config)

const prodService = await prodScope.resolve(multiEnvService)
console.log("Prod config:", prodService.config)
```