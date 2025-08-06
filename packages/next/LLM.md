# @pumped-fn/core-next - LLM Documentation

## Package Overview

**@pumped-fn/core-next** is a TypeScript functional programming library that provides container-based dependency injection and reactive programming patterns. It enables developers to create composable, testable applications with declarative dependency management.

### Installation

```bash
npm install @pumped-fn/core-next
# or
pnpm add @pumped-fn/core-next
```

### Key Value Propositions

- **Type-Safe Dependency Injection**: Automatic resolution with full TypeScript inference
- **Reactive Programming**: Automatic propagation of changes through dependency graphs
- **Lazy Evaluation**: Dependencies resolved only when needed
- **Testing Support**: Built-in mocking and isolation with scope management
- **Functional Design**: Immutable, composable patterns throughout

## Core Concepts

### Executors - Containers with Dependency Resolution

Executors are containers that hold values and manage dependencies. They are the fundamental building blocks of the dependency injection system.

**Key Characteristics:**

- Hold a factory function that produces a value
- Can have zero or more dependencies on other executors
- Lazy evaluation - values computed only when resolved
- Support reactive updates when dependencies change
- Provide type-safe dependency resolution

**Types of Executors:**

- `Core.Executor<T>` - Main executor interface with `.lazy`, `.reactive`, `.static` variants
- `Core.Lazy<T>` - Lazy-resolved executor (default behavior)
- `Core.Reactive<T>` - Reactive executor that triggers updates when changed
- `Core.Static<T>` - Static/cached executor that resolves once and caches result

### Scopes - Lazy Resolution Contexts

Scopes manage executor lifecycles and provide resolution contexts. They are lazy by nature - creating a scope does nothing until you resolve executors.

**Key Characteristics:**

- **Lazy Creation**: `createScope()` does exactly nothing until executors are resolved
- **Graph Awareness**: Only when resolving executors does the scope become aware of the dependency graph
- **Reactivity Activation**: Reactive mechanisms only work after the graph is established through resolution

**Key Responsibilities:**

- Resolve executor values with dependency injection
- Cache resolved values to avoid re-computation
- Manage reactive subscriptions and updates
- Handle cleanup and resource disposal
- Provide isolation between different execution contexts

**Scope Operations:**

- `scope.resolve(executor)` - Resolve executor value with dependency injection
- `scope.update(executor, value)` - Update executor value and trigger reactive updates. The update will fail if the executor is NOT resolved (being resolved directly or by the graph)
- `scope.onUpdate(executor, callback)` - Subscribe to reactive changes. Executor is the main executor, not the variation
- `scope.dispose()` - Clean up all resources and cached values

### Reactive Programming - Automatic Dependency Updates

Reactive executors automatically notify dependents when their values change, creating a reactive dependency graph.

**How It Works:**

1. Create reactive executor with `.reactive` property
2. Derive other executors from reactive dependencies
3. Subscribe to updates with `scope.onUpdate()`
4. Update values with `scope.update()` - dependents automatically update

**Reactive Chain Example:**

```
source.reactive → derived1.reactive → derived2.reactive
     ↓               ↓                   ↓
   update()      auto-update         auto-update
```

### Meta System - Type-Safe Decorative Information

The meta system provides a way to attach type-safe metadata to executors using StandardSchema validation.

**Purpose:**

- Add debugging information (names, descriptions)
- Attach runtime validation schemas
- Provide documentation metadata
- Enable tooling and introspection

**Usage Pattern:**

```typescript
const name = meta("service-name", string());
const service = provide(() => "hello", name("my-service"));
```

## API Reference

### Core Executor Functions

#### `provide<T>(factory, ...metas): Core.Executor<T>`

Creates an executor with no dependencies.

**Parameters:**

- `factory: Core.NoDependencyFn<T>` - Function that produces the value
- `...metas: Meta.Meta[]` - Optional metadata decorators

**Returns:** `Core.Executor<T>` - New executor instance

**Example:**

```typescript
const config = provide(() => ({
  apiUrl: "https://api.example.com",
  port: 3000,
}));
```

#### `derive<T, D>(dependencies, factory, ...metas): Core.Executor<T>`

Creates an executor with dependencies that will be resolved when accessed.

**Overloads:**

1. **Single Dependency:**

   ```typescript
   derive<T, D extends Core.BaseExecutor<unknown>>(
     dependencies: D,
     factory: Core.DependentFn<T, Core.InferOutput<D>>,
     ...metas: Meta.Meta[]
   ): Core.Executor<T>
   ```

2. **Array or Object Dependencies:**
   ```typescript
   derive<T, D extends ReadonlyArray<Core.BaseExecutor<unknown>> | Record<string, Core.BaseExecutor<unknown>>>(
     dependencies: { [K in keyof D]: D[K] },
     factory: Core.DependentFn<T, { [K in keyof D]: Core.InferOutput<D[K]> }>,
     ...metas: Meta.Meta[]
   ): Core.Executor<T>
   ```

**Parameters:**

- `dependencies` - Single executor, array of executors, or object with executor values
- `factory` - Function that receives resolved dependency values and returns the executor value
- `...metas` - Optional metadata decorators

**Returns:** `Core.Executor<T>` - New executor that lazily resolves its dependencies

**Examples:**

```typescript
// Single dependency
const userService = derive(database, (db) => createUserService(db));

// Array dependencies
const app = derive(
  [config, database, logger],
  (cfg, db, log) => createApplication(cfg, db, log)
);

// Object dependencies
const services = derive(
  { db: database, cache: redis, log: logger },
  ({ db, cache, log }) => createServiceContainer(db, cache, log)
);
```

#### `preset<T>(executor, value, ...metas): Core.Preset<T>`

Pre-populates an executor with a specific value, useful for testing and configuration.

**Parameters:**

- `executor: Core.Executor<T>` - The executor to preset
- `value: T` - The value to preset
- `...metas: Meta.Meta[]` - Optional metadata decorators

**Returns:** `Core.Preset<T>` - Preset that can be passed to `createScope()`

**Example:**

```typescript
const mockDatabase = preset(database, new MockDatabase());
const testScope = createScope(mockDatabase);
```

### Scope Management Functions

#### `createScope(...presets): Core.Scope`

Creates a new resolution scope with optional preset values.

**Parameters:**

- `...presets: Core.Preset<unknown>[]` - Optional preset executors with predefined values

**Returns:** `Core.Scope` - New scope instance

**Example:**

```typescript
const scope = createScope();
// or with presets
const testScope = createScope(preset(config, testConfig));
```

### Scope Instance Methods

#### `scope.resolve<T>(executor): Promise<T>`

Resolves an executor value within the scope, including all dependencies.

**Parameters:**

- `executor: Core.BaseExecutor<T>` - The executor to resolve

**Returns:** `Promise<T>` - Promise that resolves to the executor's value

**Example:**

```typescript
const userService = await scope.resolve(userServiceExecutor);
```

#### `scope.update<T>(executor, value | updater): Promise<void>`

Updates an executor's value and triggers reactive updates to dependents.

**⚠️ CRITICAL**: The executor MUST be resolved (directly or through dependency graph) before updating, otherwise an error will be thrown.

**Parameters:**

- `executor: Core.Executor<T>` - The MAIN executor to update (must be resolved)
- `value: T | Core.Replacer<T>` - New value or updater function

**Returns:** `Promise<void>`

**Examples:**

```typescript
// ✅ CORRECT: Resolve executor first, then update
const counter = provide(() => 0);
const scope = createScope();

// Must resolve first (directly or through graph)
await scope.resolve(counter);

// Now update works
await scope.update(counter, 42);
await scope.update(counter, (current) => current + 1);

// ❌ WRONG: Updating without resolving first
// await scope.update(counter, 42) // Error! Not resolved yet
```

#### `scope.onUpdate<T>(executor, callback): () => void`

Subscribes to reactive updates on an executor.

**⚠️ CRITICAL**: ALWAYS use the MAIN executor reference, NEVER use `.reactive` variant.

**Parameters:**

- `executor: Core.Executor<T>` - The MAIN executor to watch (NOT .reactive)
- `callback: Core.ChangeCallback<T>` - Function called when executor updates

**Returns:** `() => void` - Cleanup function to unsubscribe

**Example:**

```typescript
// ✅ CORRECT: Use main executor reference
const cleanup = scope.onUpdate(counterExecutor, (accessor) => {
  console.log("Counter updated:", accessor.get());
});

// ❌ WRONG: Never use .reactive with onUpdate
// scope.onUpdate(counterExecutor.reactive, callback); // DON'T DO THIS

// Later, cleanup subscription
cleanup();
```

#### `scope.accessor<T>(executor): Core.Accessor<T>`

Creates an accessor for an executor that provides getter/setter interface.

**Parameters:**

- `executor: Core.BaseExecutor<T>` - The executor to create accessor for

**Returns:** `Core.Accessor<T>` - Accessor with `.get()`, `.resolve()`, `.update()` methods

**Example:**

```typescript
const counterAccessor = scope.accessor(counter);
const currentValue = counterAccessor.get(); // synchronous access
await counterAccessor.update((value) => value + 1);
```

#### `scope.release<T>(executor): Promise<void>`

Releases cached value and runs cleanup functions for an executor.

**Parameters:**

- `executor: Core.BaseExecutor<T>` - The executor to release

**Returns:** `Promise<void>`

#### `scope.dispose(): Promise<void>`

Disposes the entire scope, releasing all cached values and running all cleanup functions.

**Returns:** `Promise<void>`

## Executor Variants and Reference Patterns

### ⚠️ CRITICAL: Variable Reference Patterns

**MAIN RULE**: The main executor (result of `provide`, `derive`) is the IMPORTANT variable that should be stored and referenced. Variants (`.reactive`, `.lazy`, `.static`) are singletons that should ONLY be used inline where needed.

#### ✅ CORRECT Patterns

```typescript
// Store main executor reference
const counter = provide(() => 0);
const database = derive(config, (cfg) => createDatabaseService(cfg));

// Use variants inline where needed for dependencies
const doubled = derive(counter.reactive, (count) => count * 2);
const tripled = derive(counter.reactive, (count) => count * 3);

// Use main reference for scope operations
scope.onUpdate(counter, callback); // ✅ Use main reference
scope.update(counter, 5); // ✅ Use main reference
```

#### ❌ ANTI-PATTERNS (Never do this)

```typescript
// ❌ WRONG: Never assign variants to variables
const reactiveCounter = counter.reactive; // DON'T DO THIS
const lazyDatabase = database.lazy; // DON'T DO THIS
const staticConfig = config.static; // DON'T DO THIS

// ❌ WRONG: Never use variants with scope operations
scope.onUpdate(counter.reactive, callback); // WRONG!
scope.update(counter.reactive, 5); // WRONG!
```

### Executor Variants Explained

#### Lazy Executors (Default)

Default behavior - values computed only when resolved. The main executor IS already lazy.

```typescript
const userService = derive(database, (db) => createUserService(db));
// userService is already lazy, no need for .lazy
```

#### Reactive Executors

Used ONLY inline in dependencies to enable reactivity. Never store in variables.

```typescript
// ✅ CORRECT: Use inline for dependencies
const doubled = derive(counter.reactive, (count) => count * 2);
const status = derive(counter.reactive, (count) =>
  count > 10 ? "high" : "low"
);

// Updates to counter automatically update dependents
await scope.update(counter, 5); // doubled and status update automatically
```

#### Lazy Executors

Used for conditional implementation selection. Provides accessor for conditional resolution.

```typescript
// ✅ CORRECT: Lazy executors for conditional implementations
type Logger = {
  /**/
};

const consoleLogger = provide<Logger>(() => new ConsoleLogger());
const pinoLogger = provide<Logger>(() => new PinoLogger());
const loggerConfig = provide(() => ({ type: "console" }));

const logger = derive(
  [loggerConfig, consoleLogger.lazy, pinoLogger.lazy],
  async (config, consoleAccessor, pinoAccessor): Logger => {
    if (config.type === "console") {
      return await consoleAccessor.resolve();
    } else {
      return await pinoAccessor.resolve();
    }
  }
);
```

## 🚨 Critical Best Practices and Anti-Patterns

### ✅ CORRECT Patterns Summary

1. **Store Main Executor References**

   ```typescript
   const userService = derive(database, (db) => createUserService(db));
   const counter = provide(() => 0);
   ```

2. **Use Variants Inline Only**

   ```typescript
   const doubled = derive(counter.reactive, (count) => count * 2);
   const config = derive([env, appSettings.static], (env, settingsAccessor) => {
     return env === "dev" ? devConfig : await settingsAccessor.resolve();
   });
   ```

3. **Scope Operations with Main References**

   ```typescript
   scope.onUpdate(counter, callback); // ✅ Main reference
   scope.update(counter, newValue); // ✅ Main reference
   scope.resolve(userService); // ✅ Main reference
   ```

4. **Resolve Before Update**

   ```typescript
   const scope = createScope();
   await scope.resolve(counter); // ✅ Resolve first
   await scope.update(counter, 5); // ✅ Now update works
   ```

5. **Lazy Scope Creation**
   ```typescript
   const scope = createScope(); // Does nothing until resolution
   await scope.resolve(someExecutor); // Now scope becomes aware of graph
   ```

### ❌ ANTI-PATTERNS to Avoid

1. **Never Store Variants in Variables**

   ```typescript
   // ❌ WRONG - reduces readability and loses main reference
   const reactiveCounter = counter.reactive;
   const reactiveCounter = provide(() => "value").reactive; // loose the reference to the main executor
   const lazyService = userService.lazy;
   const staticConfig = config.static;
   ```

2. **Never Use Variants with Scope Operations**

   ```typescript
   // ❌ WRONG - scope operations need main reference
   scope.onUpdate(counter.reactive, callback);
   scope.update(userService.lazy, value);
   scope.resolve(config.static);
   ```

3. **Never Update Before Resolving**

   ```typescript
   // ❌ WRONG - will throw error
   const scope = createScope();
   await scope.update(counter, 5); // Error! Not resolved yet
   ```

4. **Never Mix Reference Types**
   ```typescript
   const doubled = derive(counter.reactive, (count) => count * 2);
   // ❌ WRONG - inconsistent reference usage
   scope.onUpdate(counter.reactive, callback); // Must use main reference
   ```

### 💡 Why These Patterns Matter

- **Readability**: Main references clearly show what executors exist
- **Reactivity**: Using `.reactive` inline shows exactly which dependencies trigger updates
- **Graph Integrity**: Scope operations need main references to work correctly
- **Singleton Behavior**: Variants are singletons (`.reactive` always returns same object)
- **Conditional Resolution**: `.static` provides accessor pattern for runtime implementation selection

## 🚫 Service Architecture: Avoid Classes, Prefer Functions

### ❌ Why Classes Are Problematic with Pumped Functions

Classes create significant issues when working with async dependencies and reactive patterns in @pumped-fn/core-next:

#### **1. Async Dependency Problems**
```typescript
// ❌ WRONG: Classes force synchronous construction with async dependencies
class UserService {
  constructor(private database: Database) {
    // Constructor must be synchronous, but database might be async!
    // This creates timing and initialization problems
  }
  
  async getUser(id: string) {
    return this.database.query('SELECT * FROM users WHERE id = ?', [id])
  }
}

// Problems with class-based approach:
const userService = derive(database, (db) => new UserService(db))
// - If database creation is async, this pattern breaks
// - No way to handle async initialization properly
// - Reactive updates can't propagate through class boundaries
```

#### **2. Reactivity Pattern Incompatibility**
```typescript
// ❌ WRONG: Classes don't work well with reactive patterns
class ConfigurableService {
  private config: Config
  
  constructor(initialConfig: Config) {
    this.config = initialConfig // Static assignment
  }
  
  updateConfig(newConfig: Config) {
    this.config = newConfig // Manual state management
    // No automatic reactivity propagation
  }
}

// ❌ WRONG: Reactive updates don't propagate through classes
const service = derive(config.reactive, (cfg) => new ConfigurableService(cfg))
// When config updates, you get a NEW instance, losing all state!
```

#### **3. State Management Issues**
```typescript
// ❌ WRONG: Classes encourage mutable state
class StatefulService {
  private cache = new Map()
  private connections: Connection[] = []
  
  // Mutable state makes reactive patterns unpredictable
  // Hard to test and reason about
  // Breaks functional programming principles
}
```

### ✅ CORRECT: Function-Based Service Architecture

#### **1. Pure Functions for Business Logic**
```typescript
// ✅ CORRECT: Pure functions work perfectly with async dependencies
const createUserOperations = (database: Database) => ({
  async getUser(id: string) {
    return database.query('SELECT * FROM users WHERE id = ?', [id])
  },
  
  async createUser(userData: UserData) {
    return database.insert('users', userData)
  },
  
  async updateUser(id: string, updates: Partial<UserData>) {
    return database.update('users', { id }, updates)
  }
})

// Works seamlessly with async dependencies
const userService = derive(database, async (db) => {
  const connection = await db.connect() // Async initialization works!
  return createUserOperations(connection)
})
```

#### **2. Reactive Function Composition**
```typescript
// ✅ CORRECT: Functions compose naturally with reactive patterns
const createConfigurableService = (config: Config, logger: Logger) => ({
  async processData(data: any[]) {
    logger.info(`Processing ${data.length} items with ${config.algorithm}`)
    
    // Configuration automatically available through closure
    return data.map(item => processItem(item, config))
  },
  
  async validateInput(input: unknown) {
    return validateWithRules(input, config.validationRules)
  }
})

// ✅ CORRECT: Reactive updates create new service instances with new config
const configurableService = derive(
  [config.reactive, logger], 
  (cfg, log) => createConfigurableService(cfg, log)
)

// When config updates, service automatically gets new configuration!
```

#### **3. Functional State Management**
```typescript
// ✅ CORRECT: Immutable state with functional updates
const createCacheService = (initialState: CacheState = { entries: new Map() }) => ({
  get: (key: string) => initialState.entries.get(key),
  
  set: (key: string, value: any) => {
    // Return new instance with updated state
    return createCacheService({
      entries: new Map([...initialState.entries, [key, value]])
    })
  },
  
  clear: () => createCacheService({ entries: new Map() })
})

// ✅ CORRECT: State updates through executor updates
const cacheService = provide(() => createCacheService())

// Update state reactively
await scope.update(cacheService, (current) => current.set('key', 'value'))
```

### ✅ Service Architecture Best Practices

#### **1. Factory Functions for Complex Services**
```typescript
// ✅ CORRECT: Factory functions handle complex initialization
const createDatabaseService = async (config: DbConfig) => {
  // Async initialization is natural with functions
  const pool = await createConnectionPool(config)
  const migrations = await runMigrations(pool)
  
  return {
    async query(sql: string, params: any[]) {
      const connection = await pool.getConnection()
      try {
        return await connection.execute(sql, params)
      } finally {
        connection.release()
      }
    },
    
    async transaction<T>(fn: (tx: Transaction) => Promise<T>) {
      const tx = await pool.beginTransaction()
      try {
        const result = await fn(tx)
        await tx.commit()
        return result
      } catch (error) {
        await tx.rollback()
        throw error
      }
    },
    
    async close() {
      await pool.close()
    }
  }
}

const databaseService = derive(dbConfig, createDatabaseService)
```

#### **2. Composition Over Inheritance**
```typescript
// ✅ CORRECT: Compose services from smaller functions
const createEmailOperations = (transport: EmailTransport) => ({
  send: (to: string, subject: string, body: string) => 
    transport.sendEmail({ to, subject, body }),
  
  sendTemplate: (to: string, template: string, data: any) =>
    transport.sendTemplateEmail({ to, template, data })
})

const createNotificationOperations = (email: EmailOps, sms: SmsOps) => ({
  async notifyUser(userId: string, message: NotificationMessage) {
    const user = await getUserById(userId)
    
    if (message.urgent && user.smsEnabled) {
      await sms.send(user.phone, message.text)
    }
    
    if (user.emailEnabled) {
      await email.send(user.email, message.subject, message.body)
    }
  }
})

// Compose complex services from simpler ones
const emailOps = derive(emailTransport, createEmailOperations)
const smsOps = derive(smsTransport, createSmsOperations)
const notificationService = derive([emailOps, smsOps], createNotificationOperations)
```

#### **3. Reactive Service Updates**
```typescript
// ✅ CORRECT: Services that respond to configuration changes
const createAPIService = (config: APIConfig, httpClient: HttpClient) => ({
  async fetchUser(id: string) {
    return httpClient.get(`${config.baseUrl}/users/${id}`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` }
    })
  },
  
  async createUser(userData: UserData) {
    return httpClient.post(`${config.baseUrl}/users`, userData, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` }
    })
  }
})

// ✅ CORRECT: API service automatically updates when config changes
const apiService = derive(
  [apiConfig.reactive, httpClient],
  createAPIService
)

// When API config updates, service automatically uses new configuration
scope.onUpdate(apiService, (accessor) => {
  console.log('API service updated with new configuration')
})
```

### 💡 Key Benefits of Function-Based Architecture

1. **Async-First**: Functions naturally handle async dependencies and initialization
2. **Reactive-Friendly**: Function composition works seamlessly with reactive patterns
3. **Immutable**: Encourages immutable patterns and functional state management
4. **Testable**: Pure functions are easier to test and mock
5. **Composable**: Small functions compose into larger, more complex services
6. **Type-Safe**: Better TypeScript inference and type safety
7. **Memory Efficient**: No class instances to manage, better garbage collection

### 🚨 When You Must Use Classes

If you absolutely must use classes (e.g., integrating with libraries that require them):

```typescript
// ⚠️ ACCEPTABLE: Wrapper pattern for class-based libraries
const createThirdPartyService = async (config: Config) => {
  // Handle async initialization outside the class
  const connection = await establishConnection(config)
  
  // Create class instance with fully initialized dependencies
  const instance = new ThirdPartyServiceClass(connection)
  
  // Return functional interface, hide class implementation
  return {
    async processData(data: any[]) {
      return instance.process(data)
    },
    
    async cleanup() {
      return instance.dispose()
    }
  }
}

const thirdPartyService = derive(config, createThirdPartyService)
```

## Usage Patterns

### Basic Dependency Injection

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

// Define executors
const config = provide(() => ({
  dbUrl: "postgresql://localhost/myapp",
  apiKey: process.env.API_KEY,
}));

const database = derive(config, async (cfg) => {
  return createDatabaseService(cfg.dbUrl);
});

const userService = derive(database, (db) => {
  return createUserService(db);
});

// Use in application
const scope = createScope();
const users = await scope.resolve(userService);
const allUsers = await users.findAll();
```

### Reactive State Management

```typescript
// Create reactive state - store MAIN executor reference
const counter = provide(() => ({ count: 0, name: "clicks" }));

// ✅ CORRECT: Use .reactive inline for dependencies
const doubled = derive(counter.reactive, (state) => state.count * 2);
const isEven = derive(counter.reactive, (state) => state.count % 2 === 0);

// Create scope and subscribe to changes
const scope = createScope();

// ✅ CORRECT: Use MAIN executor for onUpdate
scope.onUpdate(doubled, (accessor) => {
  console.log("Doubled value:", accessor.get());
});

// ✅ CORRECT: Resolve first, then update
await scope.resolve(counter);

// Update state - subscribers automatically notified
await scope.update(counter, (state) => ({
  ...state,
  count: state.count + 1,
}));

// ❌ ANTI-PATTERNS to avoid:
// const reactiveCounter = counter.reactive        // DON'T store variants
// scope.onUpdate(counter.reactive, callback)      // DON'T use .reactive with onUpdate
// await scope.update(counter, value)              // DON'T update before resolving
```

### Complex Dependency Graphs

```typescript
// Configuration layer
const appConfig = provide(() => loadConfig());
const dbConfig = derive(appConfig, (cfg) => cfg.database);
const apiConfig = derive(appConfig, (cfg) => cfg.api);

// Infrastructure layer
const database = derive(dbConfig, (cfg) => createDatabaseService(cfg));
const redis = derive(appConfig, (cfg) => createRedisService(cfg.redis));
const logger = derive(appConfig, (cfg) => createLoggerService(cfg.logging));

// Service layer
const userRepo = derive(database, (db) => new UserRepository(db));
const sessionStore = derive(redis, (cache) => new SessionStore(cache));
const authService = derive(
  [userRepo, sessionStore],
  (users, sessions) => new AuthService(users, sessions)
);

// Application layer
const userController = derive(
  [authService, logger],
  (auth, log) => new UserController(auth, log)
);

const app = derive(
  [userController, apiConfig],
  (controller, config) => new ExpressApp(controller, config)
);

// Resolution
const scope = createScope();
const application = await scope.resolve(app);
await application.listen();
```

### Testing with Dependency Injection

```typescript
import { vi } from "vitest";

// Production executors
const database = provide(() => new PostgresDatabase());
const userService = derive(database, (db) => createUserService(db));

// Test setup
test("should create user", async () => {
  // Create mock implementations
  const mockDb = {
    save: vi.fn().mockResolvedValue({ id: 1, name: "John" }),
    findById: vi.fn(),
  };

  // Create test scope with mocked dependencies
  const testScope = createScope(preset(database, mockDb));

  // Test the service
  const service = await testScope.resolve(userService);
  const user = await service.createUser({ name: "John" });

  expect(mockDb.save).toHaveBeenCalledWith({ name: "John" });
  expect(user).toEqual({ id: 1, name: "John" });

  // Cleanup
  await testScope.dispose();
});
```

### Error Handling Strategies

```typescript
// Executor with error handling
const riskyService = derive(database, async (db) => {
  try {
    const connection = await db.connect();
    return new RiskyService(connection);
  } catch (error) {
    console.error("Failed to create risky service:", error);
    // Return fallback implementation
    return new MockRiskyService();
  }
});

// Scope-level error handling
const scope = createScope();

try {
  const service = await scope.resolve(riskyService);
  return await service.performOperation();
} catch (error) {
  console.error("Service operation failed:", error);
  throw new ServiceError("Operation failed", { cause: error });
} finally {
  await scope.dispose();
}
```

## Testing Patterns

### Unit Testing Individual Executors

```typescript
import { vi, test, expect } from "vitest";
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

test("userService executor should create UserService instance", async () => {
  // Mock dependencies
  const mockDatabase = { query: vi.fn(), save: vi.fn() };

  // Create test scope with preset
  const scope = createScope(preset(database, mockDatabase));

  // Resolve and test
  const service = await scope.resolve(userService);
  expect(service).toBeInstanceOf(UserService);
  expect(service.db).toBe(mockDatabase);

  await scope.dispose();
});
```

### Integration Testing with Scopes

```typescript
test("full application integration", async () => {
  // Use real implementations but with test configuration
  const testConfig = {
    database: { url: "sqlite::memory:" },
    api: { port: 0 }, // random port
  };

  const scope = createScope(preset(appConfig, testConfig));

  try {
    const app = await scope.resolve(appExecutor);
    const server = await app.listen();

    // Test API endpoints
    const response = await fetch(`http://localhost:${server.port}/users`);
    expect(response.status).toBe(200);

    await server.close();
  } finally {
    await scope.dispose();
  }
});
```

### Testing Reactive Behavior

```typescript
test("reactive executors should update dependents", async () => {
  const updateCallback = vi.fn();

  // ✅ CORRECT: Store main executor references
  const counter = provide(() => 0);
  const doubled = derive(counter.reactive, (count) => count * 2);

  const scope = createScope();

  // ✅ CORRECT: Use main executor for onUpdate
  const cleanup = scope.onUpdate(doubled, updateCallback);

  // Initial resolution - this makes counter available for updates
  await scope.resolve(doubled);

  // Update source - should trigger callback
  await scope.update(counter, 5);

  expect(updateCallback).toHaveBeenCalledTimes(1);

  cleanup();
  await scope.dispose();
});
```

## Dependency Graph Visualization

### Understanding Resolution Order

Executors form a directed acyclic graph (DAG) where dependencies must be resolved before dependents:

```
Configuration (no deps)
    ↓
Database ← Config
    ↓
UserService ← Database
    ↓
UserController ← UserService
    ↓
Application ← UserController
```

### Resolution Process

1. **Dependency Analysis**: Scope analyzes dependency graph
2. **Topological Sort**: Determines resolution order
3. **Lazy Resolution**: Only resolves executors when requested
4. **Caching**: Stores resolved values to avoid re-computation
5. **Cleanup**: Manages resource disposal when scope is disposed

### Circular Dependency Detection

The library automatically detects circular dependencies and throws `CircularDependencyError`:

```typescript
// This will throw an error
const a = derive(b, () => "a");
const b = derive(a, () => "b"); // CircularDependencyError

// Solution: Break the cycle
const shared = provide(() => createSharedResource());
const a = derive(shared, (resource) => createA(resource));
const b = derive(shared, (resource) => createB(resource));
```

## Error Handling and Troubleshooting

### Common Errors

#### CircularDependencyError

**Cause:** Executors form a circular dependency chain
**Solution:** Introduce intermediate abstraction or remove unnecessary dependency

```typescript
// Problem
const a = derive(b, () => "a");
const b = derive(a, () => "b");

// Solution
const shared = provide(() => "shared");
const a = derive(shared, () => "a");
const b = derive(shared, () => "b");
```

#### Resolution Errors

**Cause:** Factory function throws error during resolution
**Solution:** Add error handling in factory function or use try-catch during resolution

```typescript
const safeExecutor = derive(riskyDependency, async (dep) => {
  try {
    return await createService(dep);
  } catch (error) {
    console.error("Service creation failed:", error);
    return createFallbackService();
  }
});
```

### Debugging Tips

1. **Use Meta Decorators** for debugging information:

   ```typescript
   const name = meta("executor-name", custom<string>());
   const service = provide(() => createService(), name("user-service"));
   ```

2. **Test with Smaller Dependency Trees** to isolate issues

3. **Use TypeScript Strict Mode** for better type checking

## Meta System Usage

### Creating Meta Decorators

```typescript
import { meta } from "@pumped-fn/core-next";
import { string, number } from "some-schema-library";

// Create meta decorators
const name = meta("service-name", string());
const version = meta("version", number());
const description = meta("description", string());
```

### Applying Meta Information

```typescript
const userService = provide(
  () => createUserService(),
  name("user-service"),
  version(1),
  description("Handles user operations")
);
```

### Finding Meta Information

```typescript
// Find meta values on executors
const serviceName = name.find(userService); // Returns 'user-service'
const serviceVersion = version.find(userService); // Returns 1
```

### Using Built-in Meta

```typescript
import { name } from "@pumped-fn/core-next";

const service = provide(
  () => createService(),
  name("my-service") // Built-in name meta
);
```

## Integration Patterns

### Express.js Integration

```typescript
import express from "express";
import { provide, derive, createScope } from "@pumped-fn/core-next";

// Define application dependencies
const config = provide(() => ({ port: 3000 }));
const database = derive(config, (cfg) => createDatabaseService(cfg.dbUrl));
const userService = derive(database, (db) => createUserService(db));

// Create Express app executor
const app = derive([config, userService], (cfg, users) => {
  const app = express();

  app.get("/users", async (req, res) => {
    const allUsers = await users.findAll();
    res.json(allUsers);
  });

  return app;
});

// Start server
const scope = createScope();
const server = await scope.resolve(app);
server.listen(3000);
```

### Next.js Integration

```typescript
// lib/di.ts - Define dependency container
export const appScope = createScope();

// pages/api/users.ts - API route
import { userService } from "../../../lib/executors";
import { appScope } from "../../../lib/di";

export default async function handler(req, res) {
  const users = await appScope.resolve(userService);
  const allUsers = await users.findAll();
  res.json(allUsers);
}
```

### Testing Framework Integration

```typescript
// vitest.setup.ts
import { createScope, preset } from "@pumped-fn/core-next";

export function createTestScope(overrides = {}) {
  const testConfig = { ...defaultTestConfig, ...overrides };
  return createScope(
    preset(config, testConfig),
    preset(database, new MockDatabase())
  );
}

// test file
import { createTestScope } from "./vitest.setup";

test("should work with DI", async () => {
  const scope = createTestScope({ feature: "enabled" });

  try {
    const service = await scope.resolve(myService);
    const result = await service.doSomething();
    expect(result).toBeDefined();
  } finally {
    await scope.dispose();
  }
});
```

## Advanced Patterns

### Conditional Dependencies

```typescript
const isDevelopment = provide(() => process.env.NODE_ENV === "development");

const logger = derive(isDevelopment, (isDev) =>
  isDev ? new ConsoleLogger() : new FileLogger()
);
```

### Factory Pattern with DI

```typescript
const serviceFactory = provide(() => ({
  createUserService: (db: Database) => createUserService(db),
  createOrderService: (db: Database) => new OrderService(db),
}));

const userService = derive([database, serviceFactory], (db, factory) =>
  factory.createUserService(db)
);
```

### Plugin Architecture

```typescript
const plugins = provide(() => [
  new ValidationPlugin(),
  new CachingPlugin(),
  new LoggingPlugin(),
]);

const serviceWithPlugins = derive(
  [baseService, plugins],
  (service, pluginList) => {
    return pluginList.reduce(
      (enhanced, plugin) => plugin.enhance(enhanced),
      service
    );
  }
);
```

This comprehensive LLM documentation provides everything needed for AI agents and coding tools to effectively understand and use @pumped-fn/core-next for dependency injection and reactive programming patterns.
