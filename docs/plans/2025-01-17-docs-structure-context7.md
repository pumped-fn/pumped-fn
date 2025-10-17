# Documentation Structure with Context7 Integration Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Restructure documentation for Context7 optimization with goal-oriented organization, executable code examples validated by twoslash, and StackBlitz integration readiness.

**Architecture:** Goal-oriented doc structure (quick-start, decisions/, patterns/, concepts/) with self-contained pages optimized for semantic search. Executable TypeScript files in docs/code/ imported into markdown using VitePress Import Code Snippets. Context7 indexing controlled via context7.json with anti-pattern rules.

**Tech Stack:** VitePress, TypeScript, Twoslash, Context7

---

## Task 1: Create Documentation Folder Structure

**Files:**
- Create: `docs/quick-start.md`
- Create: `docs/decisions/.gitkeep`
- Create: `docs/patterns/.gitkeep`
- Create: `docs/concepts/.gitkeep`
- Create: `docs/code/.gitkeep`

**Step 1: Create base docs directory structure**

```bash
mkdir -p docs/decisions docs/patterns docs/concepts docs/code
touch docs/quick-start.md
touch docs/decisions/.gitkeep
touch docs/patterns/.gitkeep
touch docs/concepts/.gitkeep
touch docs/code/.gitkeep
```

**Step 2: Verify structure created**

Run: `tree docs -L 2`
Expected: Shows docs/ with quick-start.md and subdirectories

**Step 3: Commit structure**

```bash
git add docs/
git commit -m "docs: create goal-oriented folder structure for Context7"
```

---

## Task 2: Create context7.json Configuration

**Files:**
- Create: `context7.json`

**Step 1: Extract anti-pattern rules from llm-guide.md**

Read `docs/llm-guide.md` lines 28-71 (Critical Anti-Patterns section) and lines 73-84 (Core Principles section).

**Step 2: Create context7.json with extracted rules**

Create `context7.json` at repository root:

```json
{
  "$schema": "https://context7.com/schema/context7.json",
  "projectTitle": "Pumped-FN",
  "description": "Type-safe dependency injection with graph resolution for long-lived services and short-lived operations",
  "folders": ["docs"],
  "excludeFolders": ["src", "node_modules", "dist", "tests", ".git"],
  "rules": [
    "NEVER use ctx.get() or scope.resolve() inside executors - declare dependencies explicitly in arrays",
    "NEVER escape provide/derive with conditional logic - use .lazy for conditional resolution",
    "NEVER use classes - use object closures with captured state",
    "NEVER import with file extensions",
    "Always use derive([deps], ([deps]) => factory) array syntax",
    "Always make dependencies explicit in arrays",
    "Use meta() with standard schema for configuration validation",
    "Return objects with method closures, not class instances",
    "Keep graph depth 3-4 layers max",
    "Depend on abstractions, not implementations",
    "Use scope for long-lived resources, flows for short-lived operations",
    "Use preset() for test mocking"
  ]
}
```

**Step 3: Verify JSON is valid**

Run: `cat context7.json | jq .`
Expected: Pretty-printed JSON with no errors

**Step 4: Commit context7.json**

```bash
git add context7.json
git commit -m "docs: add Context7 configuration with anti-pattern rules"
```

---

## Task 3: Create Quick Start Documentation

**Files:**
- Modify: `docs/quick-start.md`

**Step 1: Write quick-start content**

Write self-contained quick start in `docs/quick-start.md`:

```markdown
# Quick Start

Get running with Pumped-FN in 5 minutes.

## Installation

\`\`\`bash
pnpm add @pumped-fn/core-next
\`\`\`

## Basic Example

\`\`\`typescript
import { provide, derive, createScope } from "@pumped-fn/core-next"

// Simple provider
const config = provide(() => ({ port: 3000 }))

// Derived with dependencies
const server = derive([config], ([cfg]) => ({
  start: () => {
    console.log(\`Server starting on port \${cfg.port}\`)
  }
}))

// Create scope and resolve
const scope = createScope()
const app = await scope.resolve(server)
app.start()
\`\`\`

## Core Concepts

- **Executors** - Nodes in dependency graph (created with \`provide\` or \`derive\`)
- **Scope** - Actualizes the graph, manages lifecycle
- **Dependencies** - Explicitly declared in arrays

## Next Steps

- [Decision Guides](./decisions/) - When to use what
- [Pattern Catalog](./patterns/) - Real scenarios with trade-offs
- [Concept Deep-Dives](./concepts/) - Executors, flows, extensions

## Related Examples

See executable examples in [\`docs/code/\`](./code/) directory.
```

**Step 2: Verify markdown renders correctly**

Run: `cat docs/quick-start.md`
Expected: Content displays correctly

**Step 3: Commit quick-start**

```bash
git add docs/quick-start.md
git commit -m "docs: add quick start guide"
```

---

## Task 4: Create Decision Guide Stubs

**Files:**
- Create: `docs/decisions/executors-vs-flows.md`
- Create: `docs/decisions/lazy-vs-reactive.md`
- Create: `docs/decisions/graph-design.md`
- Create: `docs/decisions/anti-patterns.md`

**Step 1: Create executors-vs-flows decision guide**

Create `docs/decisions/executors-vs-flows.md`:

```markdown
# When to Use Executors vs Flows

Decision guide for choosing between executors (long-lived) and flows (short-lived operations).

## Use Executors When

- Long-lived resources (database connections, HTTP servers)
- Shared across operations
- Needs lifecycle management (startup, cleanup)
- Part of service dependency graph

## Use Flows When

- Short-lived operations (request handling, workflows)
- Request-scoped data storage needed
- Needs isolation between executions
- Workflow orchestration with sub-flows

## Example: HTTP Service

**Executor for long-lived server:**
- Database connection pool
- Logger
- Configuration

**Flow for short-lived request:**
- HTTP request handler
- Business logic execution
- Response generation

## Related

- [Concepts: Executors and Scopes](../concepts/executors-and-scopes.md)
- [Concepts: Flows](../concepts/flows.md)
- [Pattern: Framework Integration](../patterns/framework-integration.md)
```

**Step 2: Create lazy-vs-reactive decision guide**

Create `docs/decisions/lazy-vs-reactive.md`:

```markdown
# When to Use Lazy vs Reactive Dependencies

Decision guide for choosing accessor types: eager (default), lazy, reactive, static.

## Use Lazy (.lazy) When

- Dependency only needed conditionally
- Expensive initialization should be deferred
- Optional fallback behavior

## Use Reactive (.reactive) When

- Need to re-execute when dependency changes
- Configuration updates should propagate
- Real-time data synchronization

## Use Static (.static) When

- Need direct accessor manipulation
- Manual update control required
- Subscribe to value changes

## Default (Eager) When

- Dependency always needed
- No conditional resolution
- Standard dependency injection pattern

## Related

- [Concepts: Accessors](../concepts/accessors.md)
- [LLM Guide: Advanced Accessors](../llm-guide.md#advanced-accessors-lazyreactivestatic)
```

**Step 3: Create graph-design decision guide**

Create `docs/decisions/graph-design.md`:

```markdown
# Graph Design Principles

Heuristics for composing executors into clean dependency graphs.

## When to Create an Executor

**Create separate executor when:**
- Has state or lifecycle (connections, caches, timers)
- Single clear responsibility
- Needs independent testing
- Reused across multiple dependents

**Keep as closure/function when:**
- Pure utility function
- No state
- Only used in one place

## When to Split vs Merge

**Split when:**
- Multiple reasons to change (violates single responsibility)
- Different test concerns (auth logic vs logging)
- Can be used independently

**Merge when:**
- Always used together AND single responsibility
- No independent test value
- Artificially split (just wrapping)

## Keep Graph Shallow

Target depth: 3-4 layers max
1. Configuration / Primitives
2. Infrastructure (database, cache, httpClient)
3. Domain Services
4. Features / Handlers

## Rules

- Acyclic - No circular dependencies
- Depend on abstractions, not implementations
- Make dependencies explicit

## Related

- [LLM Guide: Designing Dependency Graphs](../llm-guide.md#designing-dependency-graphs)
- [Anti-Patterns](./anti-patterns.md)
```

**Step 4: Create anti-patterns decision guide**

Create `docs/decisions/anti-patterns.md`:

```markdown
# Anti-Patterns

Critical patterns that cause runtime errors or incorrect behavior. NEVER use them.

## NEVER: Use ctx.get() or scope.resolve() in Executors

**Wrong:**
\`\`\`typescript
const bad = derive([logger], ([log], ctl) => {
  const db = ctl.scope.resolve(database) // WRONG: breaks graph
  return { query: () => {} }
})
\`\`\`

**Correct:**
\`\`\`typescript
const good = derive([logger, database], ([log, db]) => {
  return { query: () => db.execute() }
})
\`\`\`

## NEVER: Escape provide/derive with Conditional Logic

**Wrong:**
\`\`\`typescript
const bad = provide((ctl) => {
  if (someCondition) return valueA
  return valueB // WRONG: logic outside graph
})
\`\`\`

**Correct:**
\`\`\`typescript
const valueA = provide(() => "A")
const valueB = provide(() => "B")
const conditional = derive([valueA.lazy, valueB.lazy], ([a, b]) => {
  return someCondition ? a.resolve() : b.resolve()
})
\`\`\`

## NEVER: Use Classes

**Wrong:**
\`\`\`typescript
const bad = provide(() => new DatabaseService()) // WRONG
\`\`\`

**Correct:**
\`\`\`typescript
const good = provide(() => {
  const db = new Database()
  return { query: (sql) => db.exec(sql) }
})
\`\`\`

## NEVER: Import with Extensions

**Wrong:**
\`\`\`typescript
import { provide } from "@pumped-fn/core-next.ts" // WRONG
\`\`\`

**Correct:**
\`\`\`typescript
import { provide } from "@pumped-fn/core-next"
\`\`\`

## Related

- [LLM Guide: Critical Anti-Patterns](../llm-guide.md#critical-anti-patterns)
- [Graph Design Principles](./graph-design.md)
```

**Step 5: Remove .gitkeep from decisions directory**

```bash
rm docs/decisions/.gitkeep
```

**Step 6: Commit decision guides**

```bash
git add docs/decisions/
git commit -m "docs: add decision guide stubs (executors-vs-flows, lazy-vs-reactive, graph-design, anti-patterns)"
```

---

## Task 5: Create Pattern Guide Stubs

**Files:**
- Create: `docs/patterns/testing-strategies.md`
- Create: `docs/patterns/lifecycle-management.md`
- Create: `docs/patterns/framework-integration.md`

**Step 1: Create testing-strategies pattern**

Create `docs/patterns/testing-strategies.md`:

```markdown
# Testing Strategies

Patterns for testing executors, flows, and integrations with preset() mocking.

## Testing Executors with Mocks

Use \`preset()\` to replace dependencies with mocks:

\`\`\`typescript
import { describe, it, expect, vi } from "vitest"
import { createScope, preset } from "@pumped-fn/core-next"

describe("userService", () => {
  it("should create user", async () => {
    const mockDB = { createUser: vi.fn().mockResolvedValue({ id: "1" }) }

    const testScope = createScope({
      presets: [preset(database, mockDB)]
    })

    const service = await testScope.resolve(userService)
    const result = await service.create({ name: "Test" })

    expect(result.id).toBe("1")
    expect(mockDB.createUser).toHaveBeenCalled()

    await testScope.dispose()
  })
})
\`\`\`

## Testing Flows

Flows can be tested by executing them with \`scope.exec()\` and providing test context:

\`\`\`typescript
const result = await scope.exec(processOrder, { orderId: "123" }, {
  initialContext: [[requestId, "test-req-id"]],
  meta: [testConfig("value")]
})
\`\`\`

## Testing Patterns

- Mock external dependencies with \`preset()\`
- Use test scope per test (isolated)
- Always dispose scope after test
- Test executors independently from dependents

## Related

- [LLM Guide: Core Pattern 4: Testing with preset()](../llm-guide.md#core-pattern-4-testing-with-preset)
- [Decision: Graph Design](../decisions/graph-design.md)
```

**Step 2: Create lifecycle-management pattern**

Create `docs/patterns/lifecycle-management.md`:

```markdown
# Lifecycle Management

Patterns for managing resource lifecycle with \`ctl.cleanup()\`.

## Cleanup with ctl.cleanup()

Register cleanup functions in executors:

\`\`\`typescript
const pool = provide((ctl) => {
  const p = new Pool({ max: 10 })
  ctl.cleanup(async () => {
    await p.drain()
    await p.clear()
  })
  return { getConnection: () => p.connect() }
})

const database = derive([logger], ([log], ctl) => {
  const db = new Database()
  ctl.cleanup(() => db.close())
  return { query: (sql) => db.exec(sql) }
})
\`\`\`

## Scope Disposal

Trigger all cleanup functions:

\`\`\`typescript
const scope = createScope()
const db = await scope.resolve(database)
// ... use db
await scope.dispose() // triggers all cleanup functions
\`\`\`

## Patterns

- Register cleanup in executor factory
- Cleanup runs in reverse dependency order
- Always dispose scope when done (long-lived services)
- Flow cleanup is automatic

## Related

- [LLM Guide: Core Pattern 5: Lifecycle with ctl.cleanup()](../llm-guide.md#core-pattern-5-lifecycle-with-ctlcleanup)
- [Concepts: Scopes](../concepts/executors-and-scopes.md)
```

**Step 3: Create framework-integration pattern**

Create `docs/patterns/framework-integration.md`:

```markdown
# Framework Integration

Patterns for integrating with HTTP frameworks, ORMs, and external libraries.

## Keep Integration Thin

External integrations should be thin adapters. Extract business logic to plain objects.

## Anti-Pattern: Framework-Coupled

**Wrong:**
\`\`\`typescript
// ❌ Tied to Hono framework
const userController = derive([db], ([database]) => ({
  create: async (c: Context) => { // Hono Context
    const body = await c.req.json()
    return c.json(await database.createUser(body))
  }
}))
\`\`\`

## Correct Pattern: Framework-Agnostic

**Correct:**
\`\`\`typescript
// ✅ Pure business logic
const userService = derive([db], ([database]) => ({
  create: async (input: CreateUserInput) => {
    return database.createUser(input)
  }
}))

// Hono integration (thin layer)
import { Hono } from "hono"

const app = new Hono()
const scope = createScope()

app.post('/users', async (c) => {
  const service = await scope.resolve(userService)
  const input = createUserSchema.parse(await c.req.json())
  const user = await service.create(input)
  return c.json(user)
})
\`\`\`

## Benefits

- Testable without framework
- Portable across frameworks
- Clear separation of concerns

## Related

- [LLM Guide: Integration Pattern: Keep Thin](../llm-guide.md#integration-pattern-keep-thin)
- [Testing Strategies](./testing-strategies.md)
```

**Step 4: Remove .gitkeep from patterns directory**

```bash
rm docs/patterns/.gitkeep
```

**Step 5: Commit pattern guides**

```bash
git add docs/patterns/
git commit -m "docs: add pattern guide stubs (testing, lifecycle, framework-integration)"
```

---

## Task 6: Create Concept Guide Stubs

**Files:**
- Create: `docs/concepts/executors-and-scopes.md`
- Create: `docs/concepts/flows.md`
- Create: `docs/concepts/extensions.md`
- Create: `docs/concepts/multi-executors.md`
- Create: `docs/concepts/accessors.md`

**Step 1: Create executors-and-scopes concept**

Create `docs/concepts/executors-and-scopes.md`:

```markdown
# Executors and Scopes

Deep dive into executors (graph nodes) and scopes (graph actualization).

## Executors

Executors are nodes in the dependency graph, created with \`provide\` or \`derive\`.

### Simple Provider (No Dependencies)

\`\`\`typescript
export const httpChecker = provide(
  () => ({
    check: async (url: string) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      return response.ok
    }
  })
)
\`\`\`

### Derived with Dependencies

\`\`\`typescript
const logger = provide(() => ({
  info: (msg: string) => { /* log to service */ }
}))

const database = derive(
  [logger],
  ([log]) => {
    const db = new Database()
    return {
      query: (sql: string) => {
        log.info(\`Query: \${sql}\`)
        return db.exec(sql)
      }
    }
  }
)
\`\`\`

## Scopes

Scopes actualize the graph by resolving executors and managing lifecycle.

### Creating and Using Scopes

\`\`\`typescript
const scope = createScope()
const checker = await scope.resolve(httpChecker)
await checker.check("https://example.com")

// Cleanup
await scope.dispose()
\`\`\`

## Graph Resolution

- Dependencies resolved in order
- Values cached per scope
- Parallel resolution when possible

## Related

- [Decision: Graph Design](../decisions/graph-design.md)
- [Pattern: Lifecycle Management](../patterns/lifecycle-management.md)
- [LLM Guide: Core Pattern 1 & 2](../llm-guide.md#core-pattern-1-simple-provider-no-dependencies)
```

**Step 2: Create flows concept**

Create `docs/concepts/flows.md`:

```markdown
# Flows

Short-lived operations with isolated context and sub-flow execution.

## When to Use Flows

- Request handling
- Workflows
- Short-lived operations
- Request-scoped data storage

## Basic Flow

\`\`\`typescript
import { flow, accessor } from "@pumped-fn/core-next"
import { z } from "zod"

const handleUser = flow({
  name: "handleUser",
  input: z.object({ userId: z.string() }),
  output: z.object({ success: z.boolean() }),
  handler: async (ctx, input) => {
    // Flow logic
    return { success: true }
  }
})

const scope = createScope()
const result = await scope.exec(handleUser, { userId: "123" })
\`\`\`

## Flow with Dependencies

\`\`\`typescript
const database = provide(() => ({ query: (sql) => {} }))
const logger = provide(() => ({ info: (msg) => {} }))

const processOrder = flow({
  name: "processOrder",
  input: z.object({ orderId: z.string() }),
  output: z.boolean(),
  dependencies: [database, logger],
  handler: async ([db, log], ctx, input) => {
    log.info(\`Processing order \${input.orderId}\`)
    await db.query(\`UPDATE orders SET status = 'processing'\`)
    return true
  }
})
\`\`\`

## Flow Context (Request-Scoped Data)

\`\`\`typescript
const requestId = accessor("requestId", z.string())
const userId = accessor("userId", z.string())

const authFlow = flow({
  name: "auth",
  handler: (ctx, input) => {
    const reqId = ctx.get(requestId)
    const user = authenticate(input.token)
    ctx.set(userId, user.id)
    return user
  }
})

await scope.exec(authFlow, { token: "abc" }, {
  initialContext: [[requestId, "req-123"]]
})
\`\`\`

## Related

- [Decision: Executors vs Flows](../decisions/executors-vs-flows.md)
- [LLM Guide: Advanced: Flows](../llm-guide.md#advanced-flows)
```

**Step 3: Create extensions concept**

Create `docs/concepts/extensions.md`:

```markdown
# Extensions

Cross-cutting concerns that intercept operations (logging, tracing, transactions).

## When to Use Extensions

- Logging
- Distributed tracing
- Transaction management
- Metrics collection
- Error handling

## Basic Extension

\`\`\`typescript
import { extension } from "@pumped-fn/core-next"

const logger = extension({
  name: "logger",

  init: async (scope) => {
    // Initialize when scope created
  },

  wrap: async (ctx, next, operation) => {
    // Intercept all operations
    const start = Date.now()
    const result = await next()
    const duration = Date.now() - start

    if (operation.kind === "execute") {
      // log flow execution
    }

    return result
  },

  dispose: async (scope) => {
    // Cleanup when scope disposed
  }
})

const scope = createScope({ extensions: [logger] })
\`\`\`

## Extension Lifecycle Hooks

- \`init\` - Called once when scope is created
- \`dispose\` - Called once when scope is disposed
- \`wrap\` - Called for every operation (resolve, execute, etc.)
- \`onError\` - Called when errors occur in scope

## Related

- [LLM Guide: Advanced: Extensions](../llm-guide.md#advanced-extensions)
```

**Step 4: Create multi-executors concept**

Create `docs/concepts/multi-executors.md`:

```markdown
# Multi-Executors

Per-key instances for multi-tenant scenarios, connection pools, and isolated state.

## When to Use Multi-Executors

- Per-user sessions
- Per-tenant databases
- Connection pools
- Any per-key isolated instances

## Basic Multi Provide

\`\`\`typescript
import { multi } from "@pumped-fn/core-next"
import { z } from "zod"

const sessionStore = multi.provide(
  { keySchema: z.string() },
  (userId: string, ctl) => {
    const data = new Map()
    ctl.cleanup(() => data.clear())

    return {
      set: (k: string, v: unknown) => data.set(k, v),
      get: (k: string) => data.get(k)
    }
  }
)

const scope = createScope()

// Each key gets isolated instance
const userA = await scope.resolve(sessionStore("user-a"))
const userB = await scope.resolve(sessionStore("user-b"))

userA.set("cart", [1, 2, 3]) // isolated from userB
\`\`\`

## Multi Derive with Dependencies

\`\`\`typescript
const logger = provide(() => ({ info: (msg) => {} }))

const tenantDB = multi.derive(
  {
    keySchema: z.string(),
    dependencies: [logger]
  },
  ([log], tenantId: string, ctl) => {
    const db = new Database(\`/data/\${tenantId}.db\`)
    ctl.cleanup(() => db.close())

    return {
      query: (sql: string) => {
        log.info(\`[\${tenantId}] \${sql}\`)
        return db.exec(sql)
      }
    }
  }
)

const db1 = await scope.resolve(tenantDB("tenant-1"))
const db2 = await scope.resolve(tenantDB("tenant-2"))
\`\`\`

## Related

- [LLM Guide: Advanced: Multi-Executors](../llm-guide.md#advanced-multi-executors)
```

**Step 5: Create accessors concept**

Create `docs/concepts/accessors.md`:

```markdown
# Accessors

Control resolution behavior with .lazy, .reactive, and .static.

## Accessor Types

- **Default (Eager)** - Resolve immediately
- **.lazy** - Resolve on demand
- **.reactive** - Re-execute when dependency changes
- **.static** - Get accessor for manual control

## Lazy Resolution

\`\`\`typescript
const database = provide(() => new Database())
const cache = provide(() => new Cache())

// Only resolve database if cache miss
const service = derive([database.lazy, cache], ([dbAccessor, c]) => ({
  get: async (key: string) => {
    const cached = c.get(key)
    if (cached) return cached

    // Resolve database only when needed
    const db = await dbAccessor.resolve()
    return db.query(key)
  }
}))
\`\`\`

## Reactive Updates

\`\`\`typescript
const config = provide(() => ({ theme: "light", lang: "en" }))

// Re-executes when config changes
const ui = derive([config.reactive], ([cfg]) => ({
  render: () => applyTheme(cfg.theme, cfg.lang)
}))

const scope = createScope()
const renderer = await scope.resolve(ui)

// Trigger re-execution
await scope.update(config, (current) => ({ ...current, theme: "dark" }))
\`\`\`

## Static Accessor

\`\`\`typescript
const counter = provide(() => ({ count: 0 }))

const service = derive([counter.static], ([counterAccessor]) => ({
  increment: async () => {
    const current = counterAccessor.get()
    await counterAccessor.set({ count: current.count + 1 })
  },
  subscribe: (callback) => {
    return counterAccessor.subscribe(callback)
  }
}))
\`\`\`

## Related

- [Decision: Lazy vs Reactive](../decisions/lazy-vs-reactive.md)
- [LLM Guide: Advanced: Accessors](../llm-guide.md#advanced-accessors-lazyreactivestatic)
```

**Step 6: Remove .gitkeep from concepts directory**

```bash
rm docs/concepts/.gitkeep
```

**Step 7: Commit concept guides**

```bash
git add docs/concepts/
git commit -m "docs: add concept guide stubs (executors-scopes, flows, extensions, multi-executors, accessors)"
```

---

## Task 7: Create Code Examples Directory Structure

**Files:**
- Create: `docs/code/basic-usage.ts`
- Create: `docs/code/testing-with-presets.ts`
- Create: `docs/code/lifecycle-cleanup.ts`

**Step 1: Create basic-usage example**

Create `docs/code/basic-usage.ts`:

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next"

// Simple provider (no dependencies)
const config = provide(() => ({ port: 3000 }))

// Derived with dependencies
const server = derive([config], ([cfg]) => ({
  start: () => {
    console.log(`Server starting on port ${cfg.port}`)
  }
}))

// Create scope and resolve
const scope = createScope()
const app = await scope.resolve(server)
app.start()

// Cleanup
await scope.dispose()
```

**Step 2: Create testing-with-presets example**

Create `docs/code/testing-with-presets.ts`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { provide, derive, createScope, preset } from "@pumped-fn/core-next"

const database = provide(() => ({
  createUser: async (user: { name: string }) => ({ id: "real-id", ...user })
}))

const userService = derive([database], ([db]) => ({
  create: async (input: { name: string }) => {
    return db.createUser(input)
  }
}))

describe("userService", () => {
  it("should create user", async () => {
    const mockDB = { createUser: vi.fn().mockResolvedValue({ id: "1" }) }

    const testScope = createScope({
      presets: [preset(database, mockDB)]
    })

    const service = await testScope.resolve(userService)
    const result = await service.create({ name: "Test" })

    expect(result.id).toBe("1")
    expect(mockDB.createUser).toHaveBeenCalled()

    await testScope.dispose()
  })
})
```

**Step 3: Create lifecycle-cleanup example**

Create `docs/code/lifecycle-cleanup.ts`:

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next"

class Database {
  close() {
    console.log("Database connection closed")
  }
  query(sql: string) {
    return []
  }
}

const logger = provide(() => ({
  info: (msg: string) => console.log(msg)
}))

const database = derive([logger], ([log], ctl) => {
  const db = new Database()
  ctl.cleanup(() => {
    log.info("Cleaning up database connection")
    db.close()
  })
  return { query: (sql: string) => db.query(sql) }
})

const scope = createScope()
const db = await scope.resolve(database)

// Use database
db.query("SELECT * FROM users")

// Cleanup (triggers all cleanup functions in reverse order)
await scope.dispose()
```

**Step 4: Remove .gitkeep from code directory**

```bash
rm docs/code/.gitkeep
```

**Step 5: Verify examples are valid TypeScript**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No type errors

**Step 6: Commit code examples**

```bash
git add docs/code/
git commit -m "docs: add executable code examples (basic-usage, testing, lifecycle)"
```

---

## Task 8: Update context7.json to Include Code Examples

**Files:**
- Modify: `context7.json`

**Step 1: Update folders to include docs/code**

Modify `context7.json` line 5:

```json
  "folders": ["docs", "docs/code"],
```

**Step 2: Verify JSON is still valid**

Run: `cat context7.json | jq .`
Expected: Pretty-printed JSON with no errors

**Step 3: Commit context7.json update**

```bash
git add context7.json
git commit -m "docs: include docs/code in Context7 indexing"
```

---

## Task 9: Create README for Documentation Structure

**Files:**
- Create: `docs/README.md`

**Step 1: Create docs README**

Create `docs/README.md`:

```markdown
# Pumped-FN Documentation

Documentation optimized for Context7 and human consumption.

## Structure

### Quick Start
- [Quick Start](./quick-start.md) - Get running in 5 minutes

### Decision Guides
"When to use X vs Y" comparisons:
- [Executors vs Flows](./decisions/executors-vs-flows.md)
- [Lazy vs Reactive](./decisions/lazy-vs-reactive.md)
- [Graph Design Principles](./decisions/graph-design.md)
- [Anti-Patterns](./decisions/anti-patterns.md)

### Pattern Catalog
Real scenarios with trade-offs:
- [Testing Strategies](./patterns/testing-strategies.md)
- [Lifecycle Management](./patterns/lifecycle-management.md)
- [Framework Integration](./patterns/framework-integration.md)

### Concept Deep-Dives
- [Executors and Scopes](./concepts/executors-and-scopes.md)
- [Flows](./concepts/flows.md)
- [Extensions](./concepts/extensions.md)
- [Multi-Executors](./concepts/multi-executors.md)
- [Accessors](./concepts/accessors.md)

### Executable Examples
- [Code Examples](./code/) - TypeScript examples validated in CI

### LLM Guide
- [LLM Guide](./llm-guide.md) - Comprehensive guide for AI assistants

## Context7 Integration

This documentation is indexed by Context7. See [context7.json](../context7.json) for configuration.

## Contributing

Keep documentation:
- **Self-contained** - Each page should be understandable independently
- **Concrete** - Include code examples
- **Concise** - Focus on essentials
- **Cross-referenced** - Link to related docs

Code examples in `docs/code/` are validated during build.
```

**Step 2: Commit docs README**

```bash
git add docs/README.md
git commit -m "docs: add README explaining documentation structure"
```

---

## Verification & Next Steps

**Verification Steps:**

1. Verify all documentation files created:
   ```bash
   tree docs -L 2
   ```

2. Verify context7.json is valid:
   ```bash
   cat context7.json | jq .
   ```

3. Verify code examples typecheck:
   ```bash
   pnpm -F @pumped-fn/core-next typecheck
   ```

4. Verify git status is clean:
   ```bash
   git status
   ```

**Next Steps (Future Work):**

1. **VitePress Setup** - Configure VitePress with:
   - Import Code Snippets plugin
   - Twoslash integration for validation
   - Custom sidebar from structure
   - TypeDoc API generation

2. **StackBlitz Integration** - Create StackBlitz templates from code examples

3. **Content Migration** - Break llm-guide.md into decision/pattern guides (keep as-is for now)

4. **Extended Examples** - Add more code examples for:
   - Flows with dependencies
   - Extensions patterns
   - Multi-executors usage
   - Reactive patterns

5. **Context7 Submission** - Submit library to Context7 after structure is validated
