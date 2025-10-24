# Skill Improvements & CLAUDE.md Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Critical Anti-Patterns section to pumped-fn-typescript skill and clean up CLAUDE.md duplicates

**Architecture:** Detection-first approach - add anti-patterns section at top of skill to catch mistakes early. Remove duplicate concepts from CLAUDE.md, keep project-specific rules only.

**Tech Stack:** Markdown documentation, skill system

---

## Task 1: Add Critical Anti-Patterns Section to Skill

**Files:**
- Modify: `${SUPERPOWERS_SKILLS_ROOT}/pumped-fn-typescript/SKILL.md` (insert after line 24, before "## Architecture Decision Guide")
- Reference: `plans/2025-10-24-skill-improvements-and-claudemd-cleanup.md` (design document)

**Step 1: Locate skill file**

Run: `find ~/.claude/plugins -type f -name "SKILL.md" -path "*/pumped-fn-typescript/*"`
Expected: Path to skill file (e.g., `/home/user/.claude/plugins/marketplaces/pumped-fn-marketplace/claude-skill/skills/pumped-fn-typescript/SKILL.md`)

**Step 2: Read current skill structure**

Read the skill file to verify insertion point after "## Overview" section (around line 24, before "## Architecture Decision Guide")

**Step 3: Insert Critical Anti-Patterns section**

Insert after line 24 (after Overview, before Architecture Decision Guide):

```markdown
## Critical Anti-Patterns (READ THIS FIRST)

These mistakes compromise portability, testability, and reliability. Check for these patterns BEFORE writing code.

### ❌ ANTI-PATTERN 1: Multiple Scopes (Resource Duplication)

**Symptom**: Creating scope inside handlers, middleware, loops
**Impact**: Singleton resources duplicated → memory leaks, connection exhaustion, faults
**Detection**: Look for `createScope()` inside request handlers, middleware, or loops

**Why critical:** Scope holds singletons (DB pools, connections). Multiple scopes = multiple singletons = resource waste.

**Corrections by environment:**

**Self-controlled servers (Express, Hono, Fastify):**

```typescript
// ❌ WRONG: New scope every request
app.post('/users', async (req, res) => {
  const scope = createScope() // Creates new DB pool each request!
  const result = await flow.execute(createUser, req.body, { scope })
  res.json(result)
})

// ✅ CORRECT: Server as resource, one scope per app
const server = provide((controller) => {
  const scope = createScope({
    tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app' })]
  })

  const app = express()
  app.set('scope', scope)

  app.post('/users', async (req, res) => {
    const scope = req.app.get('scope')
    const result = await flow.execute(createUser, req.body, { scope })
    res.json(result)
  })

  controller.cleanup(async () => {
    await scope.dispose()
  })

  return app
})

// Usage
const app = await mainScope.resolve(server)
app.listen(3000)
```

**Meta-frameworks (TanStack Start, Next.js, SvelteKit):**

```typescript
// ❌ WRONG: New scope per request
createMiddleware().server(async ({ next }) => {
  const scope = createScope() // Memory leak!
  return next({ context: { scope } })
})

// ✅ CORRECT: One scope at module init, inject via middleware
const appScope = createScope({
  tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app' })]
})

createMiddleware().server(async ({ next }) => {
  return next({ context: { scope: appScope } })
})

// Handler gets scope from context
export const Route = createFileRoute('/users')({
  loader: async ({ context }) => {
    return flow.execute(getUsers, {}, { scope: context.scope })
  }
})
```

**CLI applications:**

```typescript
// ❌ WRONG: Global scope export (breaks test isolation)
export const scope = createScope({
  tags: [dbConfig({...})]
})

program.command('sync').action(async () => {
  await flow.execute(syncData, {}, { scope })
})

// ✅ CORRECT: Singleton via closure
function createCLI() {
  const scope = createScope({
    tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app' })]
  })

  const program = new Command()

  program.command('sync').action(async () => {
    await flow.execute(syncData, {}, { scope })
  })

  program.command('cleanup').action(async () => {
    await flow.execute(cleanupData, {}, { scope })
  })

  return {
    program,
    dispose: () => scope.dispose()
  }
}

// main.ts
const cli = createCLI()
await cli.program.parseAsync()
await cli.dispose()

// test.ts - easy to test with different scope
const testCli = createCLI() // Can inject test config via tags
```

**Key rule:** One app, one scope. Exceptions: Lambda (per invocation), CLI (per command execution).

---

### ❌ ANTI-PATTERN 2: Built-ins in Resources (Breaks Portability)

**Symptom**: Using `process.env`, `process.argv`, `__dirname`, `__filename`, `import.meta.env` inside `provide()` or `derive()` bodies
**Impact**: Code tied to specific runtime/bundler → fails in Deno/Bun/browser/edge → untestable (mocking globals)
**Detection**: Search for built-in references inside executor factory functions

**Why critical:** Built-ins are runtime-specific. Code becomes non-portable and requires global mocking in tests.

```typescript
// ❌ WRONG: Node.js-specific built-ins
export const database = provide((controller) => {
  const db = new Database({
    host: process.env.DB_HOST,        // Won't work in Deno/browser/edge
    file: __dirname + '/data.db'      // Won't work in Deno/browser/edge
  })
  return db
})

export const config = provide((controller) => {
  const args = process.argv.slice(2)  // Node.js only
  return parseArgs(args)
})

// ❌ WRONG: Bundler-specific built-ins
export const apiClient = provide((controller) => {
  const url = import.meta.env.VITE_API_URL  // Vite only
  return createClient(url)
})

// ✅ CORRECT: Parse built-ins at entry point, pass via tags

// config.ts - Define tag schemas
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
}>(), { label: 'config.database' })

export const dataDir = tag(custom<string>(), { label: 'config.dataDir' })

export const apiUrl = tag(custom<string>(), { label: 'config.apiUrl' })

// resources.ts - Use tags, not built-ins
export const database = provide((controller) => {
  const config = dbConfig.get(controller.scope)
  const dir = dataDir.get(controller.scope)

  const db = new Database({
    host: config.host,
    port: config.port,
    database: config.database,
    file: `${dir}/data.db`
  })

  controller.cleanup(async () => {
    await db.close()
  })

  return db
})

export const apiClient = provide((controller) => {
  const url = apiUrl.get(controller.scope)
  return createClient(url)
})

// main.ts (Node.js entry point) - Built-ins HERE only
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
    dataDir(__dirname),
    apiUrl(process.env.API_URL || 'http://localhost:3000')
  ]
})

// main.ts (Deno entry point) - Different built-ins, same resources
const scope = createScope({
  tags: [
    dbConfig({
      host: Deno.env.get('DB_HOST') || 'localhost',
      port: Number(Deno.env.get('DB_PORT')) || 5432,
      database: Deno.env.get('DB_NAME') || 'app'
    }),
    dataDir(new URL('.', import.meta.url).pathname),
    apiUrl(Deno.env.get('API_URL') || 'http://localhost:3000')
  ]
})

// test.ts (Testing) - No globals needed
const testScope = createScope({
  tags: [
    dbConfig({ host: 'test-db', port: 5432, database: 'test' }),
    dataDir('/tmp/test-data'),
    apiUrl('http://mock-api:3000')
  ]
})

const db = await testScope.resolve(database) // Works without mocking process.env!
```

**Symptom check**: If you're mocking `process.env`, `__dirname`, or `import.meta.env` in tests, you're doing it wrong.

**Key rule:** Built-ins stay at entry points (main.ts). Resources use tags for configuration.

---

### ❌ ANTI-PATTERN 3: Premature Escape (Passing Resolved Values)

**Symptom**: Calling `scope.resolve()` early, passing resolved values to functions/constructors
**Impact**: Components can't be tested independently → no way to inject mocks via preset()
**Detection**: Look for resolved values passed around instead of executors

**Why critical:** Once resolved, you lose ability to swap implementations. Tests can't inject mocks.

```typescript
// ❌ WRONG: Too early escape

// main.ts
const scope = createScope({
  tags: [dbConfig({...})]
})

const db = await scope.resolve(database)           // Escape too early
const userRepo = await scope.resolve(userRepository)

const app = express()
app.set('db', db)                                  // Pass resolved value
app.set('userRepo', userRepo)

app.post('/users', async (req, res) => {
  const repo = req.app.get('userRepo')             // Can't swap in tests
  const user = await repo.create(req.body)
  res.json(user)
})

// test.ts - Testing is now HARD
test('create user', async () => {
  // Can't inject test scope - already resolved to real DB!
  // Have to mock at a different layer or use real DB
  const response = await request(app)
    .post('/users')
    .send({ email: 'test@example.com' })
})

// ✅ CORRECT: Keep resolve close to usage point

// main.ts
const scope = createScope({
  tags: [dbConfig({...})]
})

const app = express()
app.set('scope', scope)                            // Pass scope, not resolved

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await flow.execute(createUser, req.body, { scope })
  res.json(result)
})

// flows.ts
const createUser = flow({
  userRepo: userRepository                         // Declare dependency
}, async (deps, ctx, input) => {
  const validated = await ctx.run('validate-input', () => {
    if (!validateEmail(input.email)) {
      return { ok: false as const, reason: 'invalid_email' }
    }
    return { ok: true as const, data: input }
  })

  if (!validated.ok) {
    return validated
  }

  const user = await ctx.run('save-user', async () => {
    return deps.userRepo.create(validated.data)    // Resolved automatically
  })

  return { ok: true, user }
})

// test.ts - Testing is EASY
test('create user', async () => {
  const mockUserRepo = derive({}, () => ({
    create: async (data: any) => ({ id: '123', ...data })
  }))

  const testScope = createScope({
    initialValues: [
      preset(userRepository, mockUserRepo)         // Inject test implementation
    ]
  })

  const result = await flow.execute(createUser,
    { email: 'test@example.com', name: 'Test User' },
    { scope: testScope }
  )

  expect(result.ok).toBe(true)
  expect(result.user.id).toBe('123')
})

// ✅ CORRECT: Explicit resolve only when framework requires it

// Example: Background job needs direct DB access
const scope = createScope({
  tags: [dbConfig({...})]
})

const db = await scope.resolve(database)           // Resolve close to usage

setInterval(async () => {
  await db.query('DELETE FROM sessions WHERE expired < NOW()')
}, 60000)

// Still testable!
test('cleanup job', async () => {
  const mockDb = provide(() => ({
    query: async (sql: string) => ({ rowCount: 5 })
  }))

  const testScope = createScope({
    initialValues: [preset(database, mockDb)]
  })

  const db = await testScope.resolve(database)
  const result = await db.query('DELETE FROM sessions WHERE expired < NOW()')
  expect(result.rowCount).toBe(5)
})
```

**Key principle**: Resolve and escape should stay close together. Most components work with executors. Only escape at interaction boundaries (framework integration, direct access needs).

**Preferred pattern**: Use flows with declared dependencies. Let the library resolve automatically.

---
```

**Step 4: Verify insertion**

Read the skill file to confirm the anti-patterns section is properly inserted between Overview and Architecture Decision Guide sections.

**Step 5: Commit**

```bash
cd ~/.claude/plugins/marketplaces/pumped-fn-marketplace
git add claude-skill/skills/pumped-fn-typescript/SKILL.md
git commit -m "feat(skill): add Critical Anti-Patterns section

Add detection-first anti-patterns section covering:
- Multiple scopes (resource duplication)
- Built-ins in resources (breaks portability)
- Premature escape (breaks testability)

Each pattern includes symptoms, impact, detection method, and
environment-specific corrections.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Clean Up CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (remove lines 27, 43-79)
- Add minimal pointer at top

**Step 1: Read current CLAUDE.md**

Read `CLAUDE.md` to verify current structure and locate sections to remove.

**Step 2: Add skill pointer at top**

Replace lines 1-4 with:

```markdown
# Pumped-fn Project Instructions

> Pumped-fn skill active: Pattern enforcement, concepts, testing strategies handled by skill.
> This file: Project-specific overrides and workflow requirements.

# Upmost important

Sacrifice English grammar for conciseness. Concrete and straightforward.
Use ast-grep where possible to search and replace code
```

**Step 3: Remove derive destructuring line**

Delete line 27: "with dependency of @pumped-fn/core-next, when using derive, prefer using destructure on factory function call where possible"

This is covered by the skill's derive patterns.

**Step 4: Remove Concepts section**

Delete lines 43-79 (entire `# Concept` section including `<principles>` and `<benefits>` tags).

The skill has comprehensive concept explanations. This duplicates that content.

**Step 5: Verify remaining structure**

After deletions, verify remaining sections are:
- Upmost important
- Plans directory
- Coding style (without derive line)
- Priority (Generic library mandate)
- Coding workflow
- Making changes

**Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: clean up CLAUDE.md duplicates

Remove content now covered by pumped-fn-typescript skill:
- Concepts section (executors, scope, flows, extensions)
- Derive destructuring guidance

Add skill pointer at top. Keep project-specific rules:
- Generic library mandate
- Plans privacy requirements
- Change workflow coordination

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Validation

**Files:**
- Read: `${SUPERPOWERS_SKILLS_ROOT}/pumped-fn-typescript/SKILL.md` (verify structure)
- Read: `CLAUDE.md` (verify brevity)

**Step 1: Verify skill structure**

Read skill file and confirm:
- Critical Anti-Patterns section appears after Overview
- All three anti-patterns included with corrections
- Section comes before Architecture Decision Guide

**Step 2: Verify CLAUDE.md brevity**

Read CLAUDE.md and confirm:
- Skill pointer at top
- No Concepts section
- No derive destructuring line
- All project-specific rules intact (plans privacy, generic mandate, change workflow)

**Step 3: Check line count reduction**

Run:
```bash
wc -l CLAUDE.md
```

Expected: Approximately 50 lines (reduced from ~93 lines, ~43 lines removed)

**Step 4: Verify no information loss**

Confirm critical project requirements still present:
- Plans must not include usernames/absolute paths
- Library must remain generic (no case-specific concepts)
- API changes require coordinated updates (docs/examples/tests/skill)

---

## Completion Criteria

- [ ] Critical Anti-Patterns section added to skill after Overview
- [ ] All three anti-patterns documented with detection, impact, corrections
- [ ] CLAUDE.md has skill pointer at top
- [ ] CLAUDE.md Concepts section removed
- [ ] CLAUDE.md derive line removed
- [ ] CLAUDE.md retains all project-specific rules
- [ ] Both files committed with descriptive messages
- [ ] Line count reduced significantly (~43 lines removed from CLAUDE.md)
