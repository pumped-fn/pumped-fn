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
const consoleLogger = provide(({ scope }): Logger => {
  const level = logConfig.level.find(scope) ?? 'info'
  return {
    log: (msg: string) => console.log(`[${level}]`, msg),
    error: (msg: string) => console.error(`[${level}]`, msg)
  }
})

const winstonLogger = provide(async ({ scope }): Promise<Logger> => {
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

const pinoLogger = provide(async ({ scope }): Promise<Logger> => {
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
