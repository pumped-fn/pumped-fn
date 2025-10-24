# Pumped-fn Skill Improvements & CLAUDE.md Cleanup

**Date**: 2025-10-24
**Status**: Design Complete

## Problem Statement

### Current Issues

1. **Skill gaps leading to production mistakes:**
   - Multiple scopes created per request → singleton resource duplication → memory leaks/faults
   - `process.env` in resources → code tied to Node.js → breaks portability (Deno, browser, edge)
   - Premature `scope.resolve()` → passing resolved values → untestable components

2. **CLAUDE.md duplication:**
   - Concepts section duplicates skill content (executors, scope, flows, extensions)
   - Derive pattern guidance already in skill
   - Confusion between project-specific rules and generic pumped-fn patterns

### Impact

- **Portability compromised**: Built-ins prevent code from running in Deno/Bun/browser/edge
- **Testability broken**: No way to inject mocks via preset() when components pass resolved values
- **Readability degraded**: Duplicate documentation creates confusion about source of truth

## Solution Design

### Part 1: Skill Improvements - Detection-First Anti-Patterns

Add **"Critical Anti-Patterns"** section immediately after Overview, before implementation guidance.

#### Anti-Pattern 1: Multiple Scopes (Resource Duplication)

**Detection**: `createScope()` inside handlers, middleware, loops
**Impact**: Multiple singletons → resource duplication, memory leaks, connection exhaustion

**Corrections by environment:**

**Self-controlled servers (Express, Hono, Fastify):**
```typescript
// ❌ WRONG
app.post('/users', async (req, res) => {
  const scope = createScope() // New DB pool every request!
})

// ✅ CORRECT: Server as resource
const server = provide((controller) => {
  const scope = createScope({ tags: [dbConfig({...})] })
  const app = express()
  app.set('scope', scope)

  controller.cleanup(async () => {
    await scope.dispose()
  })

  return app
})
```

**Meta-frameworks (TanStack Start, Next.js, SvelteKit):**
```typescript
// ❌ WRONG
createMiddleware().server(async ({ next }) => {
  const scope = createScope() // Wrong!
  return next({ context: { scope } })
})

// ✅ CORRECT: Find middleware injection point
const appScope = createScope({ tags: [dbConfig({...})] })

createMiddleware().server(async ({ next }) => {
  return next({ context: { scope: appScope } }) // Inject singleton
})

// In handlers, get from context
export const Route = createFileRoute('/users')({
  loader: async ({ context }) => {
    return flow.execute(getUsers, {}, { scope: context.scope })
  }
})
```

**CLI applications:**
```typescript
// ❌ WRONG
const scope = createScope() // Global = untestable

program.command('sync').action(async () => {
  await flow.execute(syncData, {}, { scope })
})

// ✅ CORRECT: Singleton via closure
function createCLI() {
  const scope = createScope({ tags: [dbConfig({...})] })
  const program = new Command()

  program.command('sync').action(async () => {
    await flow.execute(syncData, {}, { scope })
  })

  return { program, dispose: () => scope.dispose() }
}

// main.ts
const cli = createCLI()
cli.program.parse()
await cli.dispose()
```

#### Anti-Pattern 2: Built-ins in Resources (Breaks Portability)

**Detection**: `process.env`, `process.argv`, `__dirname`, `__filename`, `import.meta.env` inside `provide()` or `derive()` bodies
**Impact**: Tied to specific runtime/bundler, untestable (requires mocking globals)

```typescript
// ❌ WRONG: Runtime-specific built-ins
export const database = provide((controller) => {
  const db = new Database({
    host: process.env.DB_HOST,        // Node.js only
    file: __dirname + '/data.db'      // Node.js only
  })
  return db
})

export const apiClient = provide((controller) => {
  const url = import.meta.env.VITE_API_URL  // Vite only
  return createClient(url)
})

// ✅ CORRECT: Parse at entry point, pass via tags
// config.ts
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
}>(), { label: 'config.database' })

export const dataDir = tag(custom<string>(), { label: 'config.dataDir' })

// resources.ts
export const database = provide((controller) => {
  const config = dbConfig.get(controller.scope)
  const dir = dataDir.get(controller.scope)
  const db = new Database({
    host: config.host,
    file: `${dir}/data.db`
  })
  return db
})

// main.ts (Node.js entry point)
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'app'
    }),
    dataDir(__dirname)
  ]
})

// main.ts (Deno entry point)
const scope = createScope({
  tags: [
    dbConfig({
      host: Deno.env.get('DB_HOST') || 'localhost',
      port: Number(Deno.env.get('DB_PORT')) || 5432,
      database: Deno.env.get('DB_NAME') || 'app'
    }),
    dataDir(new URL('.', import.meta.url).pathname)
  ]
})

// test.ts (Testing)
const scope = createScope({
  tags: [
    dbConfig({ host: 'test-db', port: 5432, database: 'test' }),
    dataDir('/tmp/test-data')
  ]
})
```

**Symptom check**: If you're mocking `process.env` or `__dirname` in tests, you're doing it wrong.

#### Anti-Pattern 3: Premature Escape (Passing Resolved Values)

**Detection**: `scope.resolve()` called early, resolved values passed to constructors/functions instead of executors
**Impact**: Components can't be tested independently (no way to inject test scope)

```typescript
// ❌ WRONG: Too early escape
// main.ts
const scope = createScope()
const db = await scope.resolve(database)     // Escape too early
const userRepo = await scope.resolve(userRepository)

const app = express()
app.set('db', db)                            // Pass resolved value
app.set('userRepo', userRepo)

app.post('/users', async (req, res) => {
  const repo = req.app.get('userRepo')       // Can't swap in tests
  const user = await repo.create(req.body)
  res.json(user)
})

// ✅ CORRECT: Keep resolve close to usage point
// main.ts
const scope = createScope()
const app = express()
app.set('scope', scope)                      // Pass scope, not resolved

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await flow.execute(createUser, req.body, { scope })
  res.json(result)
})

// flows.ts
const createUserFlow = flow({
  userRepo: userRepository                   // Declare dependency
}, async (deps, ctx, input) => {
  return deps.userRepo.create(input)         // Resolved automatically
})

// ✅ Testing is easy
test('create user', async () => {
  const testScope = createScope({
    initialValues: [
      preset(userRepository, mockUserRepo)   // Inject test implementation
    ]
  })

  const result = await flow.execute(createUserFlow,
    { email: 'test@example.com' },
    { scope: testScope }
  )

  expect(result.ok).toBe(true)
})

// ✅ CORRECT: Explicit resolve only when needed
// Example: Background job that needs direct access
const scope = createScope()
const db = await scope.resolve(database)     // Resolve close to usage

setInterval(async () => {
  await db.query('DELETE FROM sessions WHERE expired < NOW()')
}, 60000)

// Still testable
test('cleanup job', async () => {
  const testScope = createScope({
    initialValues: [preset(database, mockDb)]
  })
  const db = await testScope.resolve(database)
  // Test cleanup logic
})
```

**Key principle**: Resolve and escape should stay close together. Most components work with executors, only escape at interaction boundaries.

### Part 2: CLAUDE.md Cleanup

**Changes:**
1. Add minimal pointer at top (skill handles pumped-fn patterns)
2. Remove Concepts section (lines 43-79) - duplicates skill
3. Remove derive destructuring line (line 27) - covered in skill
4. Keep all project-specific rules:
   - Conciseness mandate
   - Plans privacy requirements
   - General coding style (no comments, typecheck, namespace grouping)
   - Generic library mandate
   - Change workflow (docs/examples/tests/skill coordination)

**New structure:**
```markdown
# Pumped-fn Project Instructions

> Pumped-fn skill active: Pattern enforcement, concepts, testing strategies handled by skill.
> This file: Project-specific overrides and workflow requirements.

# Upmost important
[conciseness, ast-grep]

# Plans directory
[privacy requirements]

# General coding style
[no comments, typecheck, namespace grouping, pnpm, linebreaks]

# Project-specific: Generic library mandate
[no case-specific concepts in library design]

# Change workflow
[coordinate docs/examples/tests/skill updates]
```

## Implementation Phases

### Phase 1: Update Skill
1. Add "Critical Anti-Patterns" section after Overview (before "Architecture Decision Guide")
2. Include all three anti-patterns with detection symptoms, impact, and environment-specific corrections
3. Add "Symptom check" subsections for quick self-diagnosis

### Phase 2: Update CLAUDE.md
1. Add skill pointer at top
2. Remove Concepts section (lines 43-79)
3. Remove derive destructuring line (line 27)
4. Keep all other content intact

### Phase 3: Validation
1. Test skill with sample scenarios (multiple scope detection, process.env usage, premature escape)
2. Verify CLAUDE.md brevity while maintaining project-specific clarity
3. Ensure no information loss for critical project requirements

## Success Criteria

**Portability**: Resources have no built-in dependencies (process.env, __dirname, import.meta.env)
**Testability**: Components accept scope/executors, not resolved values (can inject via preset())
**Readability**: Single source of truth for pumped-fn patterns (skill), project-specific rules in CLAUDE.md

## Files Changed

- `${SUPERPOWERS_SKILLS_ROOT}/pumped-fn-typescript/SKILL.md` (add anti-patterns section)
- `CLAUDE.md` (remove duplicates, add pointer)
