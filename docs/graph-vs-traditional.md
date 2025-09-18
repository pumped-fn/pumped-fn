# Graph Resolution vs Traditional Patterns

Compare how graph resolution transforms common programming challenges.

## Code Organization

### Traditional: Manual Wiring
```typescript
// Complex initialization order requirements
class UserService {
  constructor() {
    // Must initialize in correct order
    this.config = { logLevel: 'info', db: 'db://prod', redis: 'redis://prod', email: 'smtp://prod' }
    this.logger = { log: (msg: string) => console.log(`[${this.config.logLevel}] ${msg}`) }
    this.db = { save: async (data: any) => ({ id: '123', ...data }) }
    this.cache = { set: async (key: string, value: any) => true }
    this.emailService = { sendWelcome: async (email: string) => true }
  }

  async createUser(userData) {
    // All dependencies manually wired
    const user = await this.db.save(userData)
    await this.cache.set(`user:${user.id}`, user)
    await this.emailService.sendWelcome(user.email)
    this.logger.info('User created', user.id)
    return user
  }
}
```

### Graph Resolution: Declare Dependencies
```typescript
// Dependencies declared where needed
const config = provide(() => ({ logLevel: 'info', db: 'db://prod', redis: 'redis://prod', email: 'smtp://prod' }))
const logger = derive([config], ([cfg]) => ({ log: (msg: string) => console.log(`[${cfg.logLevel}] ${msg}`) }))
const db = derive([config, logger], ([cfg, log]) => ({ save: async (data: any) => ({ id: '123', ...data }) }))
const cache = derive([config, logger], ([cfg, log]) => ({ set: async (key: string, value: any) => true }))
const emailService = derive([config, logger], ([cfg, log]) => ({ sendWelcome: async (email: string) => true }))

const userService = derive(
  [db, cache, emailService, logger],
  ([database, cache, email, log]) => ({
    async createUser(userData) {
      const user = await database.save(userData)
      await cache.set(`user:${user.id}`, user)
      await email.sendWelcome(user.email)
      log.info('User created', user.id)
      return user
    }
  })
)

// Automatic resolution in dependency order
const service = await scope.resolve(userService)
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
// Change entire system behavior with single presets
const testScope = createScope(
  preset(config, {
    logLevel: 'silent',
    db: { host: 'test-db' },
    redis: { host: 'test-redis' },
    email: { provider: 'test' }
  })
)

// Or mock specific services
const mockScope = createScope(
  preset(db, { save: async () => ({ id: '123' }) }),
  preset(cache, { set: async () => true }),
  preset(emailService, { sendWelcome: async () => true })
)

// Same code, different behavior
const service = await testScope.resolve(userService)
const result = await service.createUser({ name: 'Test' })
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
  constructor() {
    this.db = { url: globalConfig.database, query: () => [] } // Tight coupling
  }
}

class EmailService {
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
// Configuration flows through dependency graph
const config = provide(() => ({ database: 'db://prod', email: { provider: 'smtp' } }))
const dbConfig = derive([config], ([cfg]) => cfg.database)
const emailConfig = derive([config], ([cfg]) => cfg.email)

const db = derive([dbConfig], ([cfg]) => ({ url: cfg, query: () => [] }))
const emailService = derive([emailConfig], ([cfg]) => ({ provider: cfg.provider, send: () => true }))

// Different environments with different configs
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

  async processData(data) {
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
const expensiveService = provide(async () => ({ process: (data: any) => data }))

const processor = derive(
  [expensiveService.lazy], // .lazy = resolve only when accessed
  ([lazyService]) => ({
    async processData(data) {
      if (data.requiresExpensiveOperation) {
        const service = await lazyService.resolve() // Auto lazy loading
        return service.process(data)
      }
      return data
    }
  })
)

// expensiveService only creates if actually needed
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
class UserService {
  constructor(db, cache, logger) { // Add audit parameter
    this.db = db
    this.cache = cache
    this.logger = logger
    // this.audit = audit // Need to update constructor
  }
}

// Must update all instantiation sites
const userService = new UserService(db, cache, logger) // Add audit here
const app = new Application(userService) // And here
// ... and everywhere UserService is created
```

### Graph Resolution: Isolated Changes
```typescript
// Add new dependency at definition site only
const userService = derive(
  [db, cache, logger, auditService], // Just add to array
  ([database, cache, log, audit]) => ({ // Add to parameters
    async createUser(userData) {
      const user = await database.save(userData)
      await audit.logUserCreation(user) // Use new dependency
      return user
    }
  })
)

// All usage sites automatically get the new dependency
// No changes needed anywhere else
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