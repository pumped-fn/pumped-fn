# Graph Resolution vs Traditional Patterns

Compare how graph resolution transforms common programming challenges.

## Code Organization

### Traditional: Manual Wiring
```typescript
class DataService {
  constructor() {
    this.config = { logLevel: 'info', db: 'db://prod', redis: 'redis://prod', notifier: 'smtp://prod' }
    this.logger = { log: (msg: string) => console.log(`[${this.config.logLevel}] ${msg}`) }
    this.db = { save: async (data: any) => ({ id: '123', ...data }) }
    this.cache = { set: async (key: string, value: any) => true }
    this.notifier = { send: async (message: string) => true }
  }

  async createEntity(entityData: any) {
    const entity = await this.db.save(entityData)
    await this.cache.set(`entity:${entity.id}`, entity)
    await this.notifier.send(JSON.stringify(entity))
    this.logger.log('Entity created')
    return entity
  }
}
```

### Graph Resolution: Declare Dependencies
```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const config = provide(() => ({ logLevel: 'info', db: 'db://prod', redis: 'redis://prod', notifier: 'smtp://prod' }))
const logger = derive([config], ([cfg]) => ({ log: (msg: string) => console.log(`[${cfg.logLevel}] ${msg}`) }))
const db = derive([config, logger], ([cfg, log]) => ({ save: async (data: any) => ({ id: '123', ...data }) }))
const cache = derive([config, logger], ([cfg, log]) => ({ set: async (key: string, value: any) => true }))
const notifier = derive([config, logger], ([cfg, log]) => ({ send: async (message: string) => true }))

const dataService = derive(
  [db, cache, notifier, logger],
  ([database, cacheService, notify, log]) => ({
    async createEntity(entityData: any) {
      const entity = await database.save(entityData)
      await cacheService.set(`entity:${entity.id}`, entity)
      await notify.send(JSON.stringify(entity))
      log.log('Entity created')
      return entity
    }
  })
)

const scope = createScope()
const service = await scope.resolve(dataService)
```

**Benefits**:
- No manual initialization order
- Dependencies explicit at usage site
- Easy to refactor and reorganize
- Natural separation of concerns

## Testing

### Traditional: Complex Mock Setup
```typescript
// Mock every dependency manually
const mockConfig = {
  logLevel: 'silent',
  db: { host: 'test-db' },
  redis: { host: 'test-redis' },
  email: { provider: 'test' }
}

const mockLogger = {
  info: jest.fn(),
  error: jest.fn()
}

const mockDB = {
  save: jest.fn().mockResolvedValue({ id: '123' })
}

const mockCache = {
  set: jest.fn().mockResolvedValue(true)
}

const mockEmailService = {
  sendWelcome: jest.fn().mockResolvedValue(true)
}

// How do you inject all these mocks into UserService?
// Need complex dependency injection framework
```

### Graph Resolution: Single Point Changes
```typescript
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

const config = provide(() => ({ logLevel: 'info', db: { host: 'prod' }, redis: { host: 'prod' }, email: { provider: 'prod' } }))
const db = provide(() => ({ save: async (data: any) => ({ id: '123', ...data }) }))
const cache = provide(() => ({ set: async (key: string, value: any) => true }))
const notifier = provide(() => ({ send: async (message: string) => true }))
const dataService = derive([db, cache, notifier], ([database, cacheService, notify]) => ({
  async createEntity(entityData: any) {
    const entity = await database.save(entityData)
    await cacheService.set(`entity:${entity.id}`, entity)
    await notify.send(JSON.stringify(entity))
    return entity
  }
}))

const testScope = createScope(
  preset(config, {
    logLevel: 'silent',
    db: { host: 'test-db' },
    redis: { host: 'test-redis' },
    email: { provider: 'test' }
  })
)

const mockScope = createScope(
  preset(db, { save: async () => ({ id: '123' }) }),
  preset(cache, { set: async () => true }),
  preset(notifier, { send: async () => true })
)

const service = await testScope.resolve(dataService)
const result = await service.createEntity({ name: 'Test' })
```

**Benefits**:
- No mock frameworks needed
- Test entire dependency chains
- Easy environment switching
- Isolated test scopes

## Configuration Management

### Traditional: Global Configuration Hell
```typescript
// Global config object passed everywhere
const globalConfig = { database: 'db://prod', email: { provider: 'smtp' } }

class DatabaseService {
  db: any
  constructor() {
    this.db = { url: globalConfig.database, query: () => [] } // Tight coupling
  }
}

class EmailService {
  client: any
  constructor() {
    this.client = { provider: globalConfig.email.provider, send: () => true } // Tight coupling
  }
}

// Testing requires global state manipulation
beforeEach(() => {
  globalConfig.email.provider = 'test' // Modifies global state
})
```

### Graph Resolution: Localized Configuration
```typescript
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

type Config = { database: string; email: { provider: string } }
const devConfig: Config = { database: 'db://dev', email: { provider: 'console' } }
const prodConfig: Config = { database: 'db://prod', email: { provider: 'smtp' } }
const testConfig: Config = { database: 'db://test', email: { provider: 'mock' } }

const config = provide(() => ({ database: 'db://prod', email: { provider: 'smtp' } }))
const dbConfig = derive([config], ([cfg]) => cfg.database)
const emailConfig = derive([config], ([cfg]) => cfg.email)

const db = derive([dbConfig], ([cfg]) => ({ url: cfg, query: () => [] }))
const emailService = derive([emailConfig], ([cfg]) => ({ provider: cfg.provider, send: () => true }))

const devScope = createScope(preset(config, devConfig))
const prodScope = createScope(preset(config, prodConfig))
const testScope = createScope(preset(config, testConfig))
```

**Benefits**:
- No global state
- Type-safe configuration
- Environment-specific configs
- Easy to trace config usage

## Performance Optimization

### Traditional: Manual Optimization
```typescript
class Application {
  expensiveService: any
  cache: Map<any, any>

  constructor() {
    // Must manually optimize initialization
    this.expensiveService = null // Lazy initialize later
    this.cache = new Map()
  }

  async getExpensiveService() {
    if (!this.expensiveService) {
      this.expensiveService = { process: (data: any) => data }
    }
    return this.expensiveService
  }

  async processData(data: any) {
    if (data.requiresExpensiveOperation) {
      const service = await this.getExpensiveService() // Manual lazy loading
      return service.process(data)
    }
    return data
  }
}
```

### Graph Resolution: Automatic Optimization
```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const expensiveService = provide(async () => ({ process: (data: any) => data }))

const processor = derive(
  [expensiveService.lazy],
  ([lazyService]) => ({
    async processData(data: any) {
      if (data.requiresExpensiveOperation) {
        const service = await lazyService.resolve()
        return service.process(data)
      }
      return data
    }
  })
)

const scope = createScope()
const result = await scope.resolve(processor)
```

**Benefits**:
- Automatic lazy evaluation
- Built-in singleton caching
- Conditional dependency resolution
- Zero boilerplate optimization

## Refactoring

### Traditional: Ripple Effect Changes
```typescript
// Adding new dependency requires changes everywhere
class DataService {
  db: any
  cache: any
  logger: any

  constructor(db: any, cache: any, logger: any) {
    this.db = db
    this.cache = cache
    this.logger = logger
  }
}

const db = { query: () => [] }
const cache = { get: () => null }
const logger = { log: () => {} }
const dataService = new DataService(db, cache, logger)

class Application {
  constructor(service: any) {}
}
const app = new Application(dataService)
```

### Graph Resolution: Isolated Changes
```typescript
import { provide, derive } from "@pumped-fn/core-next";

const db = provide(() => ({ save: async (data: any) => ({ id: '123', ...data }) }))
const cache = provide(() => ({ set: async (key: string, value: any) => true }))
const logger = provide(() => ({ log: (msg: string) => console.log(msg) }))
const auditService = provide(() => ({ logEntityCreation: (entity: any) => console.log('audit', entity) }))

const dataService = derive(
  [db, cache, logger, auditService],
  ([database, cacheService, log, audit]) => ({
    async createEntity(entityData: any) {
      const entity = await database.save(entityData)
      await audit.logEntityCreation(entity)
      return entity
    }
  })
)
```

**Benefits**:
- Changes isolated to definition site
- No cascading modifications
- Safe refactoring
- Dependency changes don't break consumers

## Why Graph Resolution Wins

| Aspect | Traditional | Graph Resolution |
|--------|-------------|------------------|
| **Initialization** | Manual order, error-prone | Automatic topological sort |
| **Testing** | Complex mock setup | Single preset changes |
| **Configuration** | Global state coupling | Localized, flowing through graph |
| **Performance** | Manual optimization | Automatic lazy evaluation |
| **Refactoring** | Ripple effect changes | Isolated modifications |
| **Type Safety** | Often lost in abstractions | Full TypeScript inference |
| **Debugging** | Hard to trace dependencies | Clear dependency graph |
| **Reusability** | Tight coupling | Composable components |

Graph resolution isn't just a different way to manage dependencies - it's a fundamental shift that makes code more maintainable, testable, and performant by default.