## Module Authoring

**Purpose:** Patterns for creating reusable, publishable pumped-fn components

**When to use:** Building components for npm distribution, not application code

---

### Pattern 1: Reusable Resource (Configurable with Optional Dependencies)

**What:** Resources that consumers can configure for their needs

**Example:** Logger with multiple backends (console, winston, pino)

**Key principles:**
- Define interface upfront (hides implementation details)
- Each backend is an executor returning the interface
- Configuration via exported tags (not hardcoded)
- Dynamic imports for optional deps (no side effects)
- Use `.lazy` modifier + `resolve()` for selection
- Backends read config via `tag.find(scope)` in factory

**Structure:**

```typescript
import { provide, derive, tag, custom } from '@pumped-fn/core-next'

// 1. Interface (contract)
interface Logger {
  log(msg: string): void
  error(msg: string): void
}

// 2. Configuration tags
export const logConfig = {
  backend: tag(custom<'console' | 'winston' | 'pino'>(), {
    label: 'log.backend',
    default: 'console'
  }),
  level: tag(custom<'info' | 'debug' | 'error'>(), {
    label: 'log.level',
    default: 'info'
  })
}

// 3. Each backend reads config from scope
export const consoleLogger = provide(({ scope }): Logger => {
  const level = logConfig.level.find(scope) ?? 'info'
  return {
    log: (msg: string) => console.log(`[${level}]`, msg),
    error: (msg: string) => console.error(`[${level}]`, msg)
  }
})

export const winstonLogger = provide(async ({ scope }): Promise<Logger> => {
  const level = logConfig.level.find(scope) ?? 'info'

  const winston = await import('winston')
  const winstonLogger = winston.createLogger({
    level,
    transports: [new winston.transports.Console()]
  })

  return {
    log: (msg: string) => winstonLogger.info(msg),
    error: (msg: string) => winstonLogger.error(msg)
  }
})

export const pinoLogger = provide(async ({ scope }): Promise<Logger> => {
  const level = logConfig.level.find(scope) ?? 'info'

  const pino = await import('pino')
  const pinoLogger = pino({ level })

  return {
    log: (msg: string) => pinoLogger.info(msg),
    error: (msg: string) => pinoLogger.error(msg)
  }
})

// 4. Main logger selects backend via tag + lazy resolve
export const logger = derive(
  {
    console: consoleLogger.lazy,
    winston: winstonLogger.lazy,
    pino: pinoLogger.lazy
  },
  async (backends, { scope }): Promise<Logger> => {
    const backend = logConfig.backend.find(scope) ?? 'console'

    switch (backend) {
      case 'winston':
        return await backends.winston.resolve()
      case 'pino':
        return await backends.pino.resolve()
      default:
        return await backends.console.resolve()
    }
  }
)
```

**Consumer usage:**

```typescript
import { createScope } from '@pumped-fn/core-next'
import { logger, logConfig } from '@myorg/pumped-logger'

const scope = createScope({
  tags: [
    logConfig.backend('pino'),
    logConfig.level('debug')
  ]
})

const log = await scope.resolve(logger)  // Only pino loads
log.log('Hello')
```

**Key takeaways:**
- Interface defined upfront
- Backends read config via `tag.find(scope)`
- Dynamic imports prevent side effects
- `.lazy` + `resolve()` enable runtime selection
- Consumer controls everything via scope tags

---

### Pattern 2: Extension Package (Framework Adapters)

**What:** Extensions that integrate pumped-fn with frameworks

**Example:** Generic web server adapter (supports fastify, express, hono)

**Key principles:**
- Framework as peer dependency
- Interface for adapter (hide framework specifics)
- Consumer selects framework via tags
- Same lazy loading pattern as Pattern 1

**Structure:**

```typescript
import { provide, derive, tag, custom } from '@pumped-fn/core-next'

// 1. Server interface
type RouteHandler = (req: any, res: any) => void | Promise<void>

interface Server {
  listen(port: number): Promise<void>
  route(path: string, handler: RouteHandler): void
}

// 2. Configuration tags
export const serverConfig = {
  framework: tag(custom<'fastify' | 'express' | 'hono'>(), {
    label: 'server.framework',
    default: 'fastify'
  }),
  port: tag(custom<number>(), {
    label: 'server.port',
    default: 3000
  })
}

// 3. Framework adapters (lazy loaded)
export const fastifyAdapter = provide(async ({ scope }): Promise<Server> => {
  const port = serverConfig.port.find(scope) ?? 3000
  const fastify = await import('fastify')
  const app = fastify.default()

  return {
    listen: async (p: number) => { await app.listen({ port: p }) },
    route: (path, handler) => { app.get(path, handler) }
  }
})

export const expressAdapter = provide(async ({ scope }): Promise<Server> => {
  const express = await import('express')
  const app = express.default()

  return {
    listen: async (p: number) => {
      return new Promise((resolve) => app.listen(p, () => resolve()))
    },
    route: (path, handler) => { app.get(path, handler) }
  }
})

// Similar for export const honoAdapter...

// 4. Main server selector
export const server = derive(
  {
    fastify: fastifyAdapter.lazy,
    express: expressAdapter.lazy,
    hono: honoAdapter.lazy
  },
  async (adapters, { scope }): Promise<Server> => {
    const framework = serverConfig.framework.find(scope) ?? 'fastify'

    switch (framework) {
      case 'express':
        return await adapters.express.resolve()
      case 'hono':
        return await adapters.hono.resolve()
      default:
        return await adapters.fastify.resolve()
    }
  }
)
```

**Consumer usage:**

```typescript
import { createScope } from '@pumped-fn/core-next'
import { server, serverConfig } from '@myorg/pumped-server'

const scope = createScope({
  tags: [
    serverConfig.framework('express'),
    serverConfig.port(8080)
  ]
})

const srv = await scope.resolve(server)  // Only express loads
await srv.listen(8080)
```

**Key takeaways:**
- Same pattern as resources, different domain
- Framework-specific code hidden behind interface
- Consumer choice via tags
- Only selected framework loads

---

### Pattern 3: Composition and Exports

**What:** How to organize exports for reusability without compromising testing

**Key principles:**
- Export interface (contract for consumers)
- Export config tags (consumer control)
- Export main executor (primary API)
- Export individual backends (REQUIRED for preset() testing)
- Never export internals/implementation details

**How backends read configuration:**

```typescript
// Each backend reads tags from scope via controller
const pinoLogger = provide(async ({ scope }): Promise<Logger> => {
  // Read config from scope using tags
  const level = logConfig.level.find(scope) ?? 'info'

  const pino = await import('pino')
  const pinoLogger = pino({ level })

  return {
    log: (msg: string) => pinoLogger.info(msg),
    error: (msg: string) => pinoLogger.error(msg)
  }
})

// Consumer controls config via scope tags
const scope = createScope({
  tags: [
    logConfig.backend('pino'),
    logConfig.level('debug')  // Backend reads this
  ]
})
```

**Export structure:**

```typescript
// index.ts

// 1. Interface (contract)
export interface Logger {
  log(msg: string): void
  error(msg: string): void
}

// 2. Configuration tags (consumer control)
export const logConfig = {
  backend: tag(custom<'console' | 'winston' | 'pino'>(), {
    label: 'log.backend',
    default: 'console'
  }),
  level: tag(custom<'info' | 'debug' | 'error'>(), {
    label: 'log.level',
    default: 'info'
  })
}

// 3. Main executor (primary API)
export const logger = derive(...)

// 4. Individual backends (REQUIRED for testing/override)
export const consoleLogger = provide(({ scope }): Logger => {
  const level = logConfig.level.find(scope) ?? 'info'
  // ...
})
export const winstonLogger = provide(async ({ scope }): Promise<Logger> => {
  const level = logConfig.level.find(scope) ?? 'info'
  // ...
})
export const pinoLogger = provide(async ({ scope }): Promise<Logger> => {
  const level = logConfig.level.find(scope) ?? 'info'
  // ...
})
```

**Why export backends:**
- **Required for testing:** Consumers need original executor to use `preset()` for mocking
- Consumers can test with specific backend directly
- Consumers can override/extend specific backend
- Consumers can compose custom variants with subset of backends

**Testing by consumers:**

```typescript
import { logger, logConfig, pinoLogger } from '@myorg/pumped-logger'
import { preset, derive } from '@pumped-fn/core-next'

// preset requires original executor
const testLogger = derive(
  {
    pino: preset(pinoLogger, (): Logger => ({
      log: vi.fn(),
      error: vi.fn()
    })).lazy
  },
  async (backends) => await backends.pino.resolve()
)

const scope = createScope({ tags: [logConfig.backend('pino')] })
const log = await scope.resolve(testLogger)
```

**Composability by consumers:**

```typescript
import { consoleLogger, winstonLogger, logConfig } from '@myorg/pumped-logger'

// Create custom logger with only console + winston
const customLogger = derive(
  {
    console: consoleLogger.lazy,
    winston: winstonLogger.lazy
  },
  async (backends, { scope }) => {
    const backend = logConfig.backend.find(scope) ?? 'console'
    return backend === 'winston'
      ? await backends.winston.resolve()
      : await backends.console.resolve()
  }
)
```

---

### Checklist: Reusable Component Structure

☐ Interface exported (defines contract)
☐ Config tags exported (consumer control)
☐ Backends read config via `tag.find(scope)` in factory
☐ Main executor exported (primary API)
☐ **Individual backends exported (REQUIRED for preset() in consumer tests)**
☐ No implementation details exported
☐ All exports use interface types (not concrete implementations)
☐ Consumers can preset() individual components for testing
☐ Consumers can compose custom variants from exported pieces
