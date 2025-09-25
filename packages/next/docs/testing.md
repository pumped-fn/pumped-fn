# Testing Strategies - @pumped-fn/core-next

_Graph-aware testing patterns for pumped-fn applications_

## 🧪 Testing Philosophy

Testing in pumped-fn leverages the dependency graph structure to provide:

1. **Isolation** - Test components independently by mocking dependencies
2. **Integration** - Test partial graphs with selective mocking
3. **Configuration** - Test with different configurations easily
4. **Type Safety** - Maintain types even with mocks

## 🎯 Core Testing Patterns

### Pattern 1: Unit Testing with Presets

```typescript
import { createScope, preset } from "@pumped-fn/core-next";

describe("UserService", () => {
  // Mock dependencies
  const mockDatabase = {
    query: jest.fn(),
    insert: jest.fn(),
    update: jest.fn()
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  };

  test("findUser retrieves from cache first", async () => {
    // Setup test scope with mocks
    const scope = createScope({
      initialValues: [
        preset(database, mockDatabase),
        preset(cache, mockCache)
      ]
    });

    // Mock cache hit
    mockCache.get.mockResolvedValue({ id: "123", name: "Alice" });

    // Resolve service with mocked dependencies
    const service = await scope.resolve(userService);

    // Test behavior
    const user = await service.findUser("123");

    // Verify cache was checked
    expect(mockCache.get).toHaveBeenCalledWith("user:123");
    // Verify database was not queried
    expect(mockDatabase.query).not.toHaveBeenCalled();
    // Verify result
    expect(user).toEqual({ id: "123", name: "Alice" });

    // Cleanup
    await scope.dispose();
  });

  test("findUser queries database on cache miss", async () => {
    const scope = createScope({
      initialValues: [
        preset(database, mockDatabase),
        preset(cache, mockCache)
      ]
    });

    // Mock cache miss
    mockCache.get.mockResolvedValue(null);
    // Mock database response
    mockDatabase.query.mockResolvedValue({ id: "123", name: "Alice" });

    const service = await scope.resolve(userService);
    const user = await service.findUser("123");

    // Verify both were called
    expect(mockCache.get).toHaveBeenCalledWith("user:123");
    expect(mockDatabase.query).toHaveBeenCalled();
    // Verify cache was updated
    expect(mockCache.set).toHaveBeenCalledWith("user:123", { id: "123", name: "Alice" });

    await scope.dispose();
  });
});
```

### Pattern 2: Integration Testing

```typescript
describe("Order Processing Integration", () => {
  let scope: Core.Scope;

  beforeEach(() => {
    // Use real database, mock external services
    scope = createScope({
      meta: [
        dbConfigMeta({ host: ":memory:", port: 0, database: "test", ssl: false, poolSize: 1 })
      ],
      initialValues: [
        preset(paymentGateway, mockPaymentGateway),
        preset(emailService, mockEmailService)
      ]
    });
  });

  afterEach(async () => {
    await scope.dispose();
  });

  test("complete order flow", async () => {
    // Resolve the actual flow handler
    const handler = await scope.resolve(processOrderFlow);

    // Execute with real database, mocked externals
    const result = await flow.execute(handler, {
      customerId: "cust-001",
      items: [{ productId: "prod-001", quantity: 2 }],
      payment: { method: "card", token: "tok_test" }
    }, { scope });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.data.orderId).toBeDefined();
      expect(result.data.trackingNumber).toBeDefined();
    }

    // Verify external services were called
    expect(mockPaymentGateway.charge).toHaveBeenCalled();
    expect(mockEmailService.send).toHaveBeenCalled();
  });
});
```

### Pattern 3: Configuration Testing

```typescript
describe("Configuration Variations", () => {
  // Helper to create scope with config
  function createTestScope(config: {
    cacheEnabled?: boolean;
    dbPoolSize?: number;
    logLevel?: string;
  }) {
    return createScope({
      meta: [
        dbConfigMeta({
          host: ":memory:",
          port: 0,
          database: "test",
          ssl: false,
          poolSize: config.dbPoolSize || 1
        }),
        cacheConfigMeta({
          driver: config.cacheEnabled ? "redis" : "memory",
          ttl: 60,
          maxSize: 100
        }),
        logConfigMeta({
          level: (config.logLevel || "error") as any,
          format: "json"
        })
      ]
    });
  }

  test("with caching enabled", async () => {
    const scope = createTestScope({ cacheEnabled: true });
    const service = await scope.resolve(userService);
    // Test with caching behavior
    await scope.dispose();
  });

  test("with caching disabled", async () => {
    const scope = createTestScope({ cacheEnabled: false });
    const service = await scope.resolve(userService);
    // Test without caching behavior
    await scope.dispose();
  });

  test("with different pool sizes", async () => {
    const smallPool = createTestScope({ dbPoolSize: 1 });
    const largePool = createTestScope({ dbPoolSize: 10 });
    // Test performance differences
    await smallPool.dispose();
    await largePool.dispose();
  });
});
```

## 🔄 Flow Testing

### Testing Flow Handlers

```typescript
describe("CreateUserFlow", () => {
  const createUserFlow = flow.define({
    input: custom<{ email: string; name: string }>(),
    success: custom<{ userId: string }>(),
    error: custom<{ code: string; message: string }>()
  });

  const handler = createUserFlow.handler(
    { db: database, validator: emailValidator },
    async ({ db, validator }, ctx, input) => {
      if (!validator.isValid(input.email)) {
        return ctx.ko({ code: "INVALID_EMAIL", message: "Email is invalid" });
      }

      const userId = await db.createUser(input);
      return ctx.ok({ userId });
    }
  );

  test("successful user creation", async () => {
    const scope = createScope({
      initialValues: [
        preset(database, {
          createUser: jest.fn().mockResolvedValue("user-123")
        }),
        preset(emailValidator, {
          isValid: jest.fn().mockReturnValue(true)
        })
      ]
    });

    const result = await flow.execute(handler, {
      email: "test@example.com",
      name: "Test User"
    }, { scope });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.data.userId).toBe("user-123");
    }

    await scope.dispose();
  });

  test("validation failure", async () => {
    const scope = createScope({
      initialValues: [
        preset(emailValidator, {
          isValid: jest.fn().mockReturnValue(false)
        })
      ]
    });

    const result = await flow.execute(handler, {
      email: "invalid-email",
      name: "Test User"
    }, { scope });

    expect(result.isKo()).toBe(true);
    if (result.isKo()) {
      expect(result.data.code).toBe("INVALID_EMAIL");
    }

    await scope.dispose();
  });
});
```

### Testing Flow Context

```typescript
describe("Flow Context Propagation", () => {
  test("context inheritance", async () => {
    const parentFlow = flow.handler(async (ctx, input) => {
      // Set parent context
      ctx.set("traceId", "trace-123");
      ctx.set("userId", "user-456");

      // Execute child flow
      const result = await ctx.execute(childFlow, { data: input.data });
      return result;
    });

    const childFlow = flow.handler(async (ctx, input) => {
      // Access parent context
      const traceId = ctx.get("traceId");
      const userId = ctx.get("userId");

      expect(traceId).toBe("trace-123");
      expect(userId).toBe("user-456");

      return ctx.ok({ processed: true });
    });

    const result = await flow.execute(parentFlow, { data: "test" });
    expect(result.isOk()).toBe(true);
  });

  test("context isolation", async () => {
    const flow1 = flow.handler(async (ctx, input) => {
      ctx.set("flowId", "flow1");
      return ctx.ok({ id: ctx.get("flowId") });
    });

    const flow2 = flow.handler(async (ctx, input) => {
      ctx.set("flowId", "flow2");
      return ctx.ok({ id: ctx.get("flowId") });
    });

    // Execute in parallel - contexts should be isolated
    const [result1, result2] = await Promise.all([
      flow.execute(flow1, {}),
      flow.execute(flow2, {})
    ]);

    expect(result1.data.id).toBe("flow1");
    expect(result2.data.id).toBe("flow2");
  });
});
```

## 🎭 Mock Strategies

### Creating Type-Safe Mocks

```typescript
// Type-safe mock factory
function createMockDatabase(): typeof database {
  return {
    query: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn((fn) => fn())
  } as any;
}

function createMockCache<T>(): CacheService<T> {
  const storage = new Map<string, T>();

  return {
    get: jest.fn((key: string) => Promise.resolve(storage.get(key) || null)),
    set: jest.fn((key: string, value: T) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      storage.clear();
      return Promise.resolve();
    })
  };
}

// Usage
const mockDb = createMockDatabase();
const mockCache = createMockCache<User>();

const scope = createScope({
  initialValues: [
    preset(database, mockDb),
    preset(cache, mockCache)
  ]
});
```

### Partial Mocking

```typescript
describe("Partial Mocking", () => {
  test("mock only external services", async () => {
    // Real database, mocked external APIs
    const scope = createScope({
      meta: configurations.test(),  // Test database config
      initialValues: [
        // Only mock external services
        preset(paymentGateway, mockPaymentGateway),
        preset(shippingAPI, mockShippingAPI)
        // Database and cache use real test implementations
      ]
    });

    const service = await scope.resolve(orderService);
    // Test with real database, mocked externals

    await scope.dispose();
  });
});
```

## 🔬 Testing Reactive Updates

```typescript
describe("Reactive Updates", () => {
  test("reactive chain updates", async () => {
    const source = provide(() => 0);
    const doubled = derive([source.reactive], ([val]) => val * 2);
    const quadrupled = derive([doubled.reactive], ([val]) => val * 2);

    const scope = createScope();

    // Initial resolution
    await scope.resolve(quadrupled);
    expect(await scope.resolve(quadrupled)).toBe(0);

    // Update source
    await scope.update(source, 5);

    // Verify chain updated
    expect(await scope.resolve(doubled)).toBe(10);
    expect(await scope.resolve(quadrupled)).toBe(20);

    await scope.dispose();
  });

  test("subscription behavior", async () => {
    const state = provide(() => ({ count: 0 }));
    const scope = createScope();

    const values: number[] = [];
    const accessor = await scope.resolveAccessor(state);

    // Subscribe to changes
    const unsubscribe = accessor.subscribe((value) => {
      values.push(value.count);
    });

    // Trigger updates
    await accessor.update({ count: 1 });
    await accessor.update({ count: 2 });
    await accessor.update({ count: 3 });

    expect(values).toEqual([1, 2, 3]);

    unsubscribe();
    await scope.dispose();
  });
});
```

## 🔧 Test Utilities

### Scope Test Helper

```typescript
// Reusable test scope factory
export function createTestScope(options?: {
  config?: Partial<AppConfig>;
  mocks?: Array<[Core.Executor<any>, any]>;
}) {
  const { config = {}, mocks = [] } = options || {};

  // Default test configuration
  const testConfig = [
    dbConfigMeta({
      host: ":memory:",
      port: 0,
      database: "test",
      ssl: false,
      poolSize: 1,
      ...config.db
    }),
    cacheConfigMeta({
      driver: "memory",
      ttl: 1,
      maxSize: 10,
      ...config.cache
    }),
    logConfigMeta({
      level: "error",
      format: "json",
      ...config.log
    })
  ];

  // Create presets from mocks
  const presets = mocks.map(([executor, mock]) => preset(executor, mock));

  return createScope({
    meta: testConfig,
    initialValues: presets
  });
}

// Usage
test("with custom config and mocks", async () => {
  const scope = createTestScope({
    config: { cache: { ttl: 100 } },
    mocks: [
      [emailService, mockEmailService],
      [paymentGateway, mockPaymentGateway]
    ]
  });

  // Test...
  await scope.dispose();
});
```

### Assertion Helpers

```typescript
// Flow result assertions
export function assertOk<S, E>(
  result: Flow.OutputLike<S, E>
): asserts result is Flow.OK<S> {
  if (!result.isOk()) {
    throw new Error(`Expected OK but got KO: ${JSON.stringify(result.data)}`);
  }
}

export function assertKo<S, E>(
  result: Flow.OutputLike<S, E>
): asserts result is Flow.KO<E> {
  if (!result.isKo()) {
    throw new Error(`Expected KO but got OK: ${JSON.stringify(result.data)}`);
  }
}

// Usage
test("assertions", async () => {
  const result = await flow.execute(handler, input);

  assertOk(result);
  expect(result.data.userId).toBeDefined();  // TypeScript knows it's OK
});
```

## 📊 Testing Patterns by Layer

| Layer | Test Strategy | Mock Approach |
|-------|--------------|---------------|
| **Infrastructure** | Mock entirely | Use test doubles |
| **Data Access** | In-memory database | Use :memory: SQLite |
| **Services** | Mock dependencies | Preset data layer |
| **Flows** | Mock services | Test business logic |
| **API** | Integration tests | Mock external only |

## 🚀 Advanced Testing Scenarios

### Complete Integration Test Suite

```typescript
import { createScope, provide, derive, preset, flow, custom, accessor } from "@pumped-fn/core-next";
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import * as errors from "@pumped-fn/core-next";

describe("E-commerce Platform Integration", () => {
  let globalScope: Core.Scope;
  let testScope: Core.Scope;

  // Shared test infrastructure
  const testDatabase = provide(() => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, data JSON);
      CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, status TEXT, total REAL);
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, stock INTEGER);
    `);
    return sqlite;
  });

  const testCache = provide(() => new Map());

  const testEmailQueue = provide(() => {
    const queue = [];
    return {
      send: jest.fn((email) => {
        queue.push(email);
        return Promise.resolve({ id: `email-${Date.now()}` });
      }),
      getQueue: () => queue,
      clear: () => queue.length = 0
    };
  });

  beforeAll(async () => {
    // Global scope for shared resources
    globalScope = createScope();
    await globalScope.resolve(testDatabase);
  });

  afterAll(async () => {
    await globalScope.dispose();
  });

  beforeEach(() => {
    // Test-specific scope with clean state
    testScope = globalScope.pod();
  });

  afterEach(async () => {
    await globalScope.disposePod(testScope);
  });

  describe("User Registration Flow", () => {
    const userRegistration = flow.define({
      name: "user.register",
      input: custom<{ email: string; password: string }>(),
      success: custom<{ userId: string; emailSent: boolean }>(),
      error: custom<{ code: string; message: string }>()
    });

    const handler = userRegistration.handler(
      { db: testDatabase, cache: testCache, email: testEmailQueue },
      async ({ db, cache, email }, ctx, input) => {
        // Check for existing user
        const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);
        if (existing) {
          return ctx.ko({ code: "USER_EXISTS", message: "Email already registered" });
        }

        // Create user
        const userId = `user-${Date.now()}`;
        db.prepare("INSERT INTO users (id, email, data) VALUES (?, ?, ?)").run(
          userId, input.email, JSON.stringify({ password: input.password })
        );

        // Cache user
        cache.set(`user:${userId}`, { id: userId, email: input.email });

        // Send welcome email
        await email.send({
          to: input.email,
          template: "welcome",
          data: { userId }
        });

        return ctx.ok({ userId, emailSent: true });
      }
    );

    test("successful registration", async () => {
      const handlerInstance = await testScope.resolve(handler);
      const result = await flow.execute(handlerInstance, {
        email: "new@example.com",
        password: "secure123"
      }, { scope: testScope });

      assertOk(result);
      expect(result.data.userId).toMatch(/^user-/);
      expect(result.data.emailSent).toBe(true);

      // Verify database
      const db = await testScope.resolve(testDatabase);
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get("new@example.com");
      expect(user).toBeDefined();

      // Verify cache
      const cache = await testScope.resolve(testCache);
      expect(cache.has(`user:${result.data.userId}`)).toBe(true);

      // Verify email sent
      const emailQueue = await testScope.resolve(testEmailQueue);
      expect(emailQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "new@example.com" })
      );
    });

    test("duplicate email rejection", async () => {
      const db = await testScope.resolve(testDatabase);
      db.prepare("INSERT INTO users (id, email, data) VALUES (?, ?, ?)").run(
        "existing-user", "existing@example.com", "{}"
      );

      const handlerInstance = await testScope.resolve(handler);
      const result = await flow.execute(handlerInstance, {
        email: "existing@example.com",
        password: "password"
      }, { scope: testScope });

      assertKo(result);
      expect(result.data.code).toBe("USER_EXISTS");

      // Verify no email sent
      const emailQueue = await testScope.resolve(testEmailQueue);
      expect(emailQueue.send).not.toHaveBeenCalled();
    });
  });

  describe("Order Processing Pipeline", () => {
    test("complete order with inventory update", async () => {
      // Setup test data
      const db = await testScope.resolve(testDatabase);
      db.prepare("INSERT INTO products (id, name, stock) VALUES (?, ?, ?)").run(
        "prod-1", "Widget", 10
      );
      db.prepare("INSERT INTO users (id, email, data) VALUES (?, ?, ?)").run(
        "user-1", "customer@example.com", "{}"
      );

      const orderHandler = await testScope.resolve(orderProcessor);
      const result = await flow.execute(orderHandler, {
        userId: "user-1",
        items: [{ productId: "prod-1", quantity: 2 }],
        paymentMethod: "card"
      }, { scope: testScope });

      assertOk(result);

      // Verify inventory updated
      const product = db.prepare("SELECT stock FROM products WHERE id = ?").get("prod-1");
      expect(product.stock).toBe(8);

      // Verify order created
      const order = db.prepare("SELECT * FROM orders WHERE user_id = ?").get("user-1");
      expect(order).toBeDefined();
      expect(order.status).toBe("completed");
    });

    test("rollback on payment failure", async () => {
      const db = await testScope.resolve(testDatabase);
      db.prepare("INSERT INTO products (id, name, stock) VALUES (?, ?, ?)").run(
        "prod-2", "Gadget", 5
      );

      // Mock payment failure
      const failingPayment = {
        process: jest.fn().mockRejectedValue(new Error("Payment declined"))
      };

      const failingScope = createScope({
        initialValues: [
          preset(testDatabase, db),
          preset(paymentGateway, failingPayment)
        ]
      });

      const orderHandler = await failingScope.resolve(orderProcessor);
      const result = await flow.execute(orderHandler, {
        userId: "user-2",
        items: [{ productId: "prod-2", quantity: 1 }],
        paymentMethod: "card"
      }, { scope: failingScope });

      assertKo(result);
      expect(result.data.code).toBe("PAYMENT_FAILED");

      // Verify inventory NOT updated
      const product = db.prepare("SELECT stock FROM products WHERE id = ?").get("prod-2");
      expect(product.stock).toBe(5);

      // Verify no order created
      const order = db.prepare("SELECT * FROM orders WHERE user_id = ?").get("user-2");
      expect(order).toBeUndefined();

      await failingScope.dispose();
    });
  });
});
```

### Testing Error Handling

```typescript
describe("Error Handling", () => {
  test("database connection failure", async () => {
    const failingDb = {
      query: jest.fn().mockRejectedValue(new Error("Connection lost"))
    };

    const scope = createScope({
      initialValues: [preset(database, failingDb)]
    });

    const service = await scope.resolve(userService);

    await expect(service.findUser("123"))
      .rejects.toThrow("Connection lost");

    await scope.dispose();
  });

  test("cleanup on error", async () => {
    const cleanup = jest.fn();
    const failingExecutor = provide((ctl) => {
      ctl.cleanup(cleanup);
      throw new Error("Initialization failed");
    });

    const scope = createScope();

    await expect(scope.resolve(failingExecutor))
      .rejects.toThrow("Initialization failed");

    await scope.dispose();
    expect(cleanup).toHaveBeenCalled();
  });
});
```

### Testing Extensions

```typescript
describe("Extension Testing", () => {
  test("telemetry extension", async () => {
    const metrics: any[] = [];

    const telemetryExtension: Extension.Extension = {
      name: "test-telemetry",
      async wrapExecute(context, next, execution) {
        const start = Date.now();
        const result = await next();
        metrics.push({
          flow: execution.flowName,
          duration: Date.now() - start
        });
        return result;
      }
    };

    const result = await flow.execute(handler, input, {
      extensions: [telemetryExtension]
    });

    expect(metrics).toHaveLength(1);
    expect(metrics[0].flow).toBeDefined();
    expect(metrics[0].duration).toBeGreaterThanOrEqual(0);
  });
});
```

## 📚 API Reference

For complete testing APIs, see [api.md](./api.md). Key testing APIs:

- `createScope({ initialValues })` - Create test scope with mocks
- `preset(executor, value)` - Replace executor with mock
- `flow.execute(handler, input, { scope })` - Execute flow with test scope
- `scope.dispose()` - Clean up after tests

## Best Practices

1. **Always dispose scopes** - Prevent memory leaks
2. **Mock at boundaries** - Mock external services, not internal logic
3. **Test configuration variations** - Ensure components work with different configs
4. **Use type-safe mocks** - Maintain type safety even in tests
5. **Isolate test scopes** - Each test should have its own scope

## Next Steps

- [Core Concepts](./concepts.md) - Understanding dependency graphs
- [Configuration Flow](./configuration.md) - Testing with configurations
- [API Reference](./api.md) - Complete API documentation