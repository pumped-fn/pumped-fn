# Module Authoring Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add module authoring guidance to pumped-fn skill for creating reusable, publishable components with optional dependencies and proper testability.

**Architecture:** Pattern-based reference file (~2-3k words) with 3 core patterns: (1) Reusable Resource with optional dependencies, (2) Extension Package for framework adapters, (3) Composition and exports strategy. Integrates into existing skill structure via Module Authoring Mode detection.

**Tech Stack:** Markdown, bash (grep patterns), pumped-fn API patterns (provide, derive, tag, lazy, resolve, preset)

---

## Task 1: Create references/authoring.md with Pattern 1

**Files:**
- Create: `.claude/skills/pumped-fn/references/authoring.md`

**Step 1: Create authoring.md with header and Pattern 1**

```markdown
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
```

**Step 2: Verify file created**

Run: `ls -lh .claude/skills/pumped-fn/references/authoring.md`
Expected: File exists

**Step 3: Count words in Pattern 1**

Run: `wc -w .claude/skills/pumped-fn/references/authoring.md`
Expected: ~800-900 words

**Step 4: Commit**

```bash
git add .claude/skills/pumped-fn/references/authoring.md
git commit -m "feat(skill): add Pattern 1 (Reusable Resource) to authoring reference"
```

---

## Task 2: Add Pattern 2 (Extension Package) to authoring.md

**Files:**
- Modify: `.claude/skills/pumped-fn/references/authoring.md`

**Step 1: Append Pattern 2 to authoring.md**

Add after Pattern 1:

```markdown
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
const fastifyAdapter = provide(async ({ scope }): Promise<Server> => {
  const port = serverConfig.port.find(scope) ?? 3000
  const fastify = await import('fastify')
  const app = fastify.default()

  return {
    listen: async (p: number) => { await app.listen({ port: p }) },
    route: (path, handler) => { app.get(path, handler) }
  }
})

const expressAdapter = provide(async ({ scope }): Promise<Server> => {
  const express = await import('express')
  const app = express.default()

  return {
    listen: async (p: number) => {
      return new Promise((resolve) => app.listen(p, () => resolve()))
    },
    route: (path, handler) => { app.get(path, handler) }
  }
})

// Similar for honoAdapter...

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
```

**Step 2: Verify content**

Run: `grep -c "Pattern 2" .claude/skills/pumped-fn/references/authoring.md`
Expected: At least 1 match

**Step 3: Count total words**

Run: `wc -w .claude/skills/pumped-fn/references/authoring.md`
Expected: ~1500-1700 words

**Step 4: Commit**

```bash
git add .claude/skills/pumped-fn/references/authoring.md
git commit -m "feat(skill): add Pattern 2 (Extension Package) to authoring reference"
```

---

## Task 3: Add Pattern 3 (Composition and Exports) to authoring.md

**Files:**
- Modify: `.claude/skills/pumped-fn/references/authoring.md`

**Step 1: Append Pattern 3 to authoring.md**

Add after Pattern 2:

```markdown
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
```

**Step 2: Verify Pattern 3 added**

Run: `grep -c "Pattern 3" .claude/skills/pumped-fn/references/authoring.md`
Expected: At least 1 match

**Step 3: Count total words**

Run: `wc -w .claude/skills/pumped-fn/references/authoring.md`
Expected: ~2400-2800 words (target < 3000)

**Step 4: Commit**

```bash
git add .claude/skills/pumped-fn/references/authoring.md
git commit -m "feat(skill): add Pattern 3 (Composition and Exports) to authoring reference"
```

---

## Task 4: Update SKILL.md with Module Authoring Mode

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Add Module Authoring Mode section after Continuous Development**

Find the section that ends with "Continuous Development Mode" and add after it (before `## Quick Navigation`):

```markdown
### Module Authoring Mode (Creating Reusable Components)

**Detection:**
- User mentions: "reusable", "package", "library", "module", "publish"
- User asks: "How do I make this reusable?", "Can this be a package?"
- Code patterns: Creating executors meant for npm distribution

**Workflow:**
1. Load references/authoring.md
2. Identify pattern type: Reusable Resource vs Extension Package
3. Apply configurability patterns (interface + tags + lazy loading)
4. Ensure proper exports structure (interface, tags, main, backends)
5. Validate composition and testability

**Key requirements for modules:**
- Configuration via exported tags (not hardcoded)
- Dynamic imports for optional dependencies (no side effects)
- All backends exported (required for preset() testing)
- Interface-first design (hide implementation details)
```

**Step 2: Verify section added**

Run: `grep -c "Module Authoring Mode" .claude/skills/pumped-fn/SKILL.md`
Expected: 1 match

**Step 3: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add Module Authoring Mode detection to SKILL.md"
```

---

## Task 5: Add grep patterns to Quick Navigation

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Add authoring grep patterns to Quick Navigation section**

Find the `## Quick Navigation` section and add these patterns after the existing ones:

```markdown
# Finding module authoring guidance
grep -l "Pattern 1.*Reusable Resource" references/*.md
grep -l "Pattern 2.*Extension Package" references/*.md
grep -l "Pattern 3.*Composition and Exports" references/*.md
grep -l "preset.*original executor" references/*.md
```

**Step 2: Test grep patterns work**

Run: `grep -l "Pattern 1.*Reusable Resource" .claude/skills/pumped-fn/references/*.md`
Expected: `references/authoring.md`

Run: `grep -l "Pattern 3.*Composition and Exports" .claude/skills/pumped-fn/references/*.md`
Expected: `references/authoring.md`

**Step 3: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add authoring grep patterns to Quick Navigation"
```

---

## Task 6: Update Reference Files table in SKILL.md

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Add authoring.md row to Reference Files table**

Find the `## Reference Files` section table and add this row:

```markdown
| **authoring.md** | 3 module authoring patterns (Reusable Resource, Extension Package, Composition/Exports) with optional dependencies | ~2600 words | When creating reusable/publishable components, libraries, or extensions |
```

**Step 2: Verify table updated**

Run: `grep -c "authoring.md" .claude/skills/pumped-fn/SKILL.md`
Expected: At least 1 match

**Step 3: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add authoring.md to Reference Files table"
```

---

## Task 7: Final verification

**Files:**
- Read: `.claude/skills/pumped-fn/SKILL.md`
- Read: `.claude/skills/pumped-fn/references/authoring.md`

**Step 1: Verify SKILL.md word count still under limit**

Run: `wc -w .claude/skills/pumped-fn/SKILL.md`
Expected: < 2000 words (should be ~1700-1800 now)

**Step 2: Verify authoring.md word count**

Run: `wc -w .claude/skills/pumped-fn/references/authoring.md`
Expected: 2400-2800 words (target < 3000)

**Step 3: Verify all grep patterns work**

Run:
```bash
grep -l "Module Authoring Mode" .claude/skills/pumped-fn/SKILL.md
grep -l "Pattern 1.*Reusable Resource" .claude/skills/pumped-fn/references/*.md
grep -l "Pattern 2.*Extension Package" .claude/skills/pumped-fn/references/*.md
grep -l "Pattern 3.*Composition" .claude/skills/pumped-fn/references/*.md
```

Expected: All return correct file paths

**Step 4: Verify file structure**

Run: `ls -lh .claude/skills/pumped-fn/references/`
Expected: 6 files (anti-patterns, authoring, decision-trees, environments, templates, validation)

**Step 5: Final commit message**

```bash
git add -A
git commit -m "feat(skill): complete module authoring skill integration

Added references/authoring.md with 3 patterns:
- Pattern 1: Reusable Resource with optional dependencies
- Pattern 2: Extension Package for framework adapters
- Pattern 3: Composition and exports for testability

Updated SKILL.md with:
- Module Authoring Mode detection
- Grep patterns for finding authoring content
- Reference files table entry

Total: ~2600 words in authoring.md, SKILL.md remains < 2000 words"
```

---

## Summary

**Files created:**
- `.claude/skills/pumped-fn/references/authoring.md` (~2600 words)

**Files modified:**
- `.claude/skills/pumped-fn/SKILL.md` (added ~150 words)

**Commits:** 7 atomic commits

**Verification:**
- SKILL.md < 2000 words ✓
- authoring.md < 3000 words ✓
- All grep patterns working ✓
- 3 patterns complete ✓
- Integration seamless ✓
