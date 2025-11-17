---
name: flow-context
tags: flow, modify, ctx.run, ctx.parallel, ctx.parallelSettled, ctx.set, ctx.get, context, journaling
description: Flow execution context operations - ctx.run() for journaled operations, ctx.parallel() for concurrent execution, ctx.parallelSettled() for partial failures, and reading/writing context state with tags. Direct operations use ctx.run(), NOT ctx.exec().
---

# Flow: Context Operations

## Architecture Note

**Flow.Context** extends **ExecutionContext.Context**, the standalone execution primitive:
- ExecutionContext provides: `exec()`, `get()`, `find()`, `set()`, `end()`, `throwIfAborted()`, tag inheritance, abort signals
- Flow.Context adds: `run()` (journaling), `parallel()`, `parallelSettled()`, `resetJournal()`, overloaded `exec()` with retry/timeout
- For direct ExecutionContext usage (without flows), use `scope.createExecution()`
- Reference the layered map + atom graph in `docs/index.md` for enforced boundaries between ExecutionContext, Flow medium, Scope core, and detached extensions
- See extension-authoring.md for ExecutionContext API details

### Tag Inheritance

- FlowDefinition tags and `flow.execute` `executionTags` are merged via `mergeFlowTags` before FlowContext initializes.
- Extensions receive the merged list through `operation.context.tags`; order is definition tags first, then execution tags.
- Undefined entries never reach the context (helper filters them), so `ctx.get()` and `ctx.find()` stay stable even when users spread conditional tags.

## When to Use

Use context operations (`ctx`) when:

- **ctx.run()** - Journaling direct operations (validation, calculation, I/O)
- **ctx.parallel()** - Running multiple flows/operations concurrently
- **ctx.parallelSettled()** - Running operations that may partially fail
- **ctx.set()/ctx.get()** - Storing metadata across flow execution
- **ctx.exec()** - Calling sub-flows (see flow-subflows.md)
- **ctx.resetJournal()** - Clearing journal for re-execution or retry logic

**Don't use for:**
- Simple calculations that don't need journaling (just use direct code)
- Sub-flow calls (use `ctx.exec()`, not `ctx.run()`)

---

## ctx.run() - Journaled Operations

### Purpose

`ctx.run()` journals and executes direct operations:
- Validations
- Calculations
- Resource calls (database queries, HTTP requests)
- Any operation you want tracked in the journal

### Pattern


See: `processData` in skill-examples/flows-context.ts

```typescript
import { flow } from '@pumped-fn/core-next'

const processData = flow(async (ctx, input: string) => {
  // ✅ Journal validation
  const validation = await ctx.run('validate', () => {
    if (!input || input.trim() === '') {
      return { ok: false as const, reason: 'EMPTY' as const }
    }
    return { ok: true as const }
  })

  if (!validation.ok) {
    return { success: false, reason: validation.reason }
  }

  // ✅ Journal transformation
  const transformed = await ctx.run('transform', () => {
    return input.toUpperCase()
  })

  // ✅ Journal external call
  const saved = await ctx.run('save', async () => {
    return await saveToDatabase(transformed)
  })

  return { success: true, result: saved }
})
```

**Key Points:**
- First argument is journal key (string)
- Second argument is operation (sync or async function)
- Returns the operation's result
- Journal key must be unique within the flow
- Same key = deduplication (cached result returned)

---

## Real Examples from Pumped-fn Tests

### Example 1: Basic Journaling (flow-expected.test.ts)

```typescript
const fetchData = vi.fn(() => Promise.resolve("data"))

const loadData = flow<{ url: string }, { data: string }>(
  async (ctx, _input) => {
    const data = await ctx.run("fetch", () => fetchData())
    return { data }
  }
)

const result = await flow.execute(loadData, { url: "http://test.com" })
// result.data === "data"
// fetchData called once, journaled as "fetch"
```

### Example 2: Deduplication (flow-expected.test.ts)

```typescript
let executionCount = 0
const incrementCounter = vi.fn(() => ++executionCount)

const deduplicatedOps = flow<Record<string, never>, { value: number }>(
  async (ctx, _input) => {
    const firstCall = await ctx.run("op", () => incrementCounter())
    const secondCall = await ctx.run("op", () => incrementCounter())
    return { value: firstCall }
  }
)

const result = await flow.execute(deduplicatedOps, {})
// result.value === 1
// incrementCounter called ONLY ONCE (deduplication by key)
```

**Deduplication behavior:**
- Same key returns cached result
- Operation function not executed on duplicate calls
- Useful for avoiding redundant expensive operations

### Example 3: Multi-step with Resources (flow-expected.test.ts)

```typescript
const apiService = provide(() => ({ fetch: fetchMock }))

const fetchUserById = flow(apiService, async (api, ctx, userId: number) => {
  // ✅ ctx.run() journals resource call
  const response = await ctx.run("fetch-user", () =>
    api.fetch(`/users/${userId}`)
  )
  return { userId, username: `user${userId}`, raw: response.data }
})

const fetchPostsByUserId = flow(
  { api: apiService },
  async ({ api }, ctx, userId: number) => {
    // ✅ ctx.run() journals resource call
    const response = await ctx.run("fetch-posts", () =>
      api.fetch(`/posts?userId=${userId}`)
    )
    return { posts: [{ id: 1, title: "Post 1" }], raw: response.data }
  }
)

const getUserWithPosts = flow(
  { api: apiService },
  async ({ api: _api }, ctx, userId: number) => {
    const user = await ctx.exec(fetchUserById, userId)
    const posts = await ctx.exec(fetchPostsByUserId, userId)

    // ✅ ctx.run() journals enrichment logic
    const enriched = await ctx.run("enrich", () => ({
      ...user,
      postCount: posts.posts.length
    }))

    return enriched
  }
)
```

**Pattern:**
- Sub-flows use `ctx.run()` internally for operations
- Parent uses `ctx.exec()` to orchestrate sub-flows
- `ctx.run()` used for direct logic (enrichment)

### Example 4: Validation with Discriminated Unions (templates.md)

```typescript
const createUser = flow(
  { userRepo: userRepository },
  async ({ userRepo }, ctx, input: { email: string; name: string }) => {
    // ✅ ctx.run() for validation logic
    const validation = await ctx.run('validate-input', () => {
      if (!input.email.includes('@')) {
        return { ok: false as const, reason: 'INVALID_EMAIL' as const }
      }
      if (input.name.length < 2) {
        return { ok: false as const, reason: 'NAME_TOO_SHORT' as const }
      }
      return { ok: true as const }
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    // ✅ ctx.run() for database query
    const existing = await ctx.run('check-existing', async () => {
      return userRepo.findByEmail(input.email)
    })

    if (existing !== null) {
      return { success: false, reason: 'EMAIL_EXISTS' }
    }

    // ✅ ctx.run() for database write
    const user = await ctx.run('create-user', async () => {
      return userRepo.create({
        email: input.email,
        name: input.name
      })
    })

    return { success: true, user }
  }
)
```

**Pattern:**
- Each logical step gets its own journal key
- Validation returns discriminated union for type narrowing
- Resource operations journaled separately

---

## ctx.parallel() - Concurrent Execution

### Purpose

Execute multiple flows concurrently and wait for all to complete. All operations must succeed.

### Pattern


See: `processData` in skill-examples/flows-context.ts

```typescript
import { flow } from '@pumped-fn/core-next'

const fetchUserData = flow(async (ctx, userId: string) => {
  // ✅ Start multiple flows concurrently
  const profilePromise = ctx.exec(fetchProfile, userId)
  const settingsPromise = ctx.exec(fetchSettings, userId)
  const preferencesPromise = ctx.exec(fetchPreferences, userId)

  // ✅ Wait for all to complete
  const parallel = await ctx.parallel([
    profilePromise,
    settingsPromise,
    preferencesPromise
  ])

  // ✅ Access results in order
  return {
    profile: parallel.results[0],
    settings: parallel.results[1],
    preferences: parallel.results[2]
  }
})
```

**Key Points:**
- Takes array of Promised values (from `ctx.exec()` or async operations)
- Returns `{ results: T[] }` - results in same order as input
- Throws if ANY operation fails (fail-fast)
- Operations start immediately when promises are created

---

## Real Example: ctx.parallel() (flow-expected.test.ts)

```typescript
const doubleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { r: input.x * 2 }
})

const tripleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { r: input.x * 3 }
})

const combineResults = flow<{ val: number }, { sum: number }>(
  async (ctx, input) => {
    // ✅ Start both flows concurrently
    const doublePromise = ctx.exec(doubleAsync, { x: input.val })
    const triplePromise = ctx.exec(tripleAsync, { x: input.val })

    // ✅ Wait for both to complete
    const parallel = await ctx.parallel([doublePromise, triplePromise])

    // ✅ Results in same order as input array
    const sum = parallel.results[0].r + parallel.results[1].r
    return { sum }
  }
)

const result = await flow.execute(combineResults, { val: 5 })
// result.sum === 25 (10 + 15)
```

**Performance:**
- Both flows run concurrently (~10ms total, not ~20ms sequential)
- Results synchronized and returned in order

---

## ctx.parallelSettled() - Partial Failures

### Purpose

Execute multiple operations concurrently, collecting both successes and failures. Continues even if some operations fail.

### Pattern


See: `processData` in skill-examples/flows-context.ts

```typescript
import { flow } from '@pumped-fn/core-next'

const fetchMultipleResources = flow(async (ctx, resourceIds: string[]) => {
  // ✅ Start all fetches concurrently
  const promises = resourceIds.map(id => ctx.exec(fetchResource, id))

  // ✅ Wait for all to settle (success or failure)
  const settled = await ctx.parallelSettled(promises)

  // ✅ Access statistics
  console.log(`Succeeded: ${settled.stats.succeeded}`)
  console.log(`Failed: ${settled.stats.failed}`)

  // ✅ Filter successes and failures
  const successful = settled.results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)

  const failed = settled.results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason)

  return { successful, failed }
})
```

**Key Points:**
- Takes array of Promised values
- Returns `{ results: SettledResult[], stats: { succeeded, failed } }`
- Each result has `status: 'fulfilled' | 'rejected'`
- Fulfilled: `{ status: 'fulfilled', value: T }`
- Rejected: `{ status: 'rejected', reason: Error }`
- Never throws - always returns results

---

## Real Example: ctx.parallelSettled() (flow-expected.test.ts)

```typescript
const successFlow = flow<Record<string, never>, { ok: boolean }>(() => ({
  ok: true
}))

const failureFlow = flow(() => {
  throw new FlowError("Failed", "ERR")
})

const gatherResults = flow<
  Record<string, never>,
  { succeeded: number; failed: number }
>(async (ctx, _input) => {
  // ✅ Start three flows: two success, one failure
  const first = ctx.exec(successFlow, {})
  const second = ctx.exec(failureFlow, {})
  const third = ctx.exec(successFlow, {})

  // ✅ Wait for all to settle
  const settled = await ctx.parallelSettled([first, second, third])

  // ✅ Stats automatically calculated
  return {
    succeeded: settled.stats.succeeded,
    failed: settled.stats.failed
  }
})

const result = await flow.execute(gatherResults, {})
// result.succeeded === 2
// result.failed === 1
```

**Use cases:**
- Bulk operations where partial success is acceptable
- Fetching multiple resources (continue if some fail)
- Batch processing with error collection

---

## ctx.resetJournal() - Clear Journal Entries

### Purpose

Clear journal entries to allow re-execution of previously journaled operations. Useful for retry logic or repeated operations within a flow.

### Pattern

```typescript
import { flow } from '@pumped-fn/core-next'

const retryOperation = flow(async (ctx, input: string) => {
  // First attempt
  const attempt1 = await ctx.exec({
    key: 'operation',
    fn: () => ({ result: 'first' })
  })

  // Clear journal to allow re-execution
  ctx.resetJournal()

  // Second attempt - same key, will execute again
  const attempt2 = await ctx.exec({
    key: 'operation',
    fn: () => ({ result: 'second' })
  })

  return { attempt1, attempt2 }
})
```

### Pattern Matching

```typescript
import { flow } from '@pumped-fn/core-next'

const batchProcess = flow(async (ctx, items: string[]) => {
  // First batch
  for (const item of items) {
    await ctx.exec({
      key: `process:${item}`,
      fn: () => processItem(item)
    })
  }

  // Clear only entries matching 'process'
  ctx.resetJournal('process')

  // Re-run batch - will execute again
  for (const item of items) {
    await ctx.exec({
      key: `process:${item}`,
      fn: () => processItem(item)
    })
  }

  return { processed: items.length }
})
```

**Key Points:**
- `ctx.resetJournal()` - Clears all journal entries
- `ctx.resetJournal(pattern)` - Clears entries where user key contains pattern
- Pattern matching only applies to user-provided key portion
- Flow name and depth portions are not matched
- Allows re-execution of previously journaled operations
- Use for retry logic, repeated operations, or clearing stale cache

---

## Reading and Writing Context

### Purpose

Store metadata and state across flow execution using tags.

### Pattern: ctx.set() and ctx.get()

```typescript
import { tag, custom, flow, flowMeta } from '@pumped-fn/core-next'

// Define custom tag
const processingKey = tag(custom<string>(), { label: 'customKey' })

const storeCustomValue = flow(async (ctx, input: string) => {
  // ✅ Write to context
  ctx.set(processingKey, `processed-${input}`)

  // ✅ Read from context
  const value = ctx.get(processingKey)

  return input.toUpperCase()
})
```

### Real Example: Context Access (flow-expected.test.ts)

```typescript
const processingKey = tag(custom<string>(), { label: "customKey" })

const storeCustomValue = flow(async (ctx, input: string) => {
  // ✅ Set custom value in context
  ctx.set(processingKey, `processed-${input}`)
  return input.toUpperCase()
})

const execution = flow.execute(storeCustomValue, "hello")
await execution

// ✅ Access context after execution
const metadata = await execution.ctx()
const customValue = metadata?.context.find(processingKey)
// customValue === "processed-hello"
```

---

## Built-in Context Metadata (flowMeta)

### Available Metadata

```typescript
import { flowMeta } from '@pumped-fn/core-next'

const inspectFlow = flow(async (ctx, input: number) => {
  const result = await ctx.run('operation', () => input * 2)
  return result
})

const execution = flow.execute(inspectFlow, 42)
await execution
const metadata = await execution.ctx()

// ✅ Flow name
const flowName = metadata?.context.find(flowMeta.flowName)
// "anonymous"

// ✅ Execution depth (nested flows)
const depth = metadata?.context.get(flowMeta.depth)
// 0 (top-level flow)

// ✅ Parallel execution flag
const isParallel = metadata?.context.get(flowMeta.isParallel)
// false

// ✅ Journal (all ctx.run() operations)
const journal = metadata?.context.find(flowMeta.journal)
// Map with journal entries
```

### Example: Accessing Journal (flow-expected.test.ts)

```typescript
const multiStepCalculation = flow(async (ctx, input: number) => {
  const doubled = await ctx.run("double", () => input * 2)
  const tripled = await ctx.run("triple", () => input * 3)
  const combined = await ctx.run("sum", () => doubled + tripled)
  return combined
})

const execution = flow.execute(multiStepCalculation, 10)
await execution
const metadata = await execution.ctx()

// ✅ Journal tracks all operations
const journal = metadata?.context.find(flowMeta.journal)
// journal?.size === 3

const journalKeys = Array.from(journal?.keys() || [])
// ["double", "triple", "sum"]
```

---

## inDetails() - Result with Context

### Purpose

Get both the result AND context in a single call, with discriminated union for success/failure.

### Pattern


See: `processData` in skill-examples/flows-context.ts

```typescript
import { flow } from '@pumped-fn/core-next'

const calculateBoth = flow(async (ctx, input: { x: number; y: number }) => {
  const sum = await ctx.run('sum', () => input.x + input.y)
  const product = await ctx.run('product', () => input.x * input.y)
  return { sum, product }
})

const details = await flow.execute(calculateBoth, { x: 5, y: 3 }).inDetails()

// ✅ Discriminated union
if (details.success) {
  console.log(details.result.sum)      // 8
  console.log(details.result.product)  // 15
} else {
  console.log(details.error)
}

// ✅ Context available in both branches
const journal = details.ctx.context.find(flowMeta.journal)
```

### Real Example: inDetails() (flow-expected.test.ts)

```typescript
const calculateBoth = flow(async (ctx, input: { x: number; y: number }) => {
  const sum = await ctx.run("sum", () => input.x + input.y)
  const product = await ctx.run("product", () => input.x * input.y)
  return { sum, product }
})

const details = await flow.execute(calculateBoth, { x: 5, y: 3 }).inDetails()

// ✅ Type-safe discriminated union
expect(details.success).toBe(true)
if (details.success) {
  expect(details.result.sum).toBe(8)
  expect(details.result.product).toBe(15)
}

// ✅ Context always available
expect(details.ctx).toBeDefined()
const journal = details.ctx.context.find(flowMeta.journal)
expect(journal?.size).toBeGreaterThan(0)
```

### Example: Error with Context (flow-expected.test.ts)

```typescript
const operationWithError = flow(async (ctx, input: number) => {
  await ctx.run("before-error", () => input * 2)
  throw new Error("test error")
})

const details = await flow.execute(operationWithError, 5).inDetails()

// ✅ Discriminated union narrows error type
expect(details.success).toBe(false)
if (!details.success) {
  expect((details.error as Error).message).toBe("test error")
}

// ✅ Context preserved even on error
expect(details.ctx).toBeDefined()
const journal = details.ctx.context.find(flowMeta.journal)
expect(journal?.size).toBeGreaterThan(0)  // "before-error" was journaled
```

---

## Promised Chaining with Context

### Pattern: Access Context After Transformations

```typescript
const doubleValue = flow(async (ctx, input: number) => {
  await ctx.run("increment", () => input + 1)
  return input * 2
})

// ✅ inDetails() works after .map()
const details = await flow
  .execute(doubleValue, 10)
  .map((x) => x + 1)  // Transform result
  .inDetails()

if (details.success) {
  console.log(details.result)  // 21 (10 * 2 + 1)
}

// ✅ Context preserved through transformations
const journal = details.ctx.context.find(flowMeta.journal)
// Still has "increment" entry
```

---

## Execution Options: details Flag

### details: false (default)

Returns unwrapped result:

```typescript
const doubleValue = flow((_ctx, input: number) => input * 2)

const result = await flow.execute(doubleValue, 5, { details: false })
// result === 10 (unwrapped)
```

### details: true

Returns wrapped result with context:

```typescript
const incrementValue = flow((_ctx, input: number) => input + 1)

const processNested = flow(async (ctx, input: number) => {
  const incremented = await ctx.exec(incrementValue, input)
  return incremented * 2
})

const details = await flow.execute(processNested, 5, { details: true })

if (details.success) {
  console.log(details.result)  // 12
  console.log(details.ctx.context.get(flowMeta.depth))  // 0
}
```

---

## Anti-patterns

### ❌ Using ctx.run() for Sub-flows

```typescript
// ❌ WRONG: Don't use ctx.run() for sub-flows
const result = await ctx.run('validate', async () => {
  return await flow.execute(validateOrder, input)
})

// ✅ CORRECT: Use ctx.exec()
const result = await ctx.exec(validateOrder, input)
```

### ❌ Duplicate Journal Keys

```typescript
// ❌ WRONG: Duplicate keys cause deduplication
const first = await ctx.run('step', () => calculateA())
const second = await ctx.run('step', () => calculateB())
// second === first (deduplication!)

// ✅ CORRECT: Unique keys
const first = await ctx.run('calculate-a', () => calculateA())
const second = await ctx.run('calculate-b', () => calculateB())
```

### ❌ Over-journaling

```typescript
// ❌ WRONG: Journaling trivial operations
const result = await ctx.run('add', () => x + y)
const doubled = await ctx.run('double', () => result * 2)

// ✅ CORRECT: Journal meaningful operations only
const result = await ctx.run('calculate-total', () => {
  const sum = x + y
  return sum * 2
})
```

**Guidance:**
- Journal operations that have side effects (I/O, mutations)
- Journal complex calculations worth tracking
- Skip journaling trivial computations
- Use judgment based on debugging value

---

## Troubleshooting

### Issue: ctx.run() not deduplicating

**Symptom:** Same operation runs multiple times with same key

```typescript
const first = await ctx.run('fetch', () => fetch('/api/data'))
const second = await ctx.run('fetch', () => fetch('/api/data'))
// Both fetch calls execute
```

**Cause:** Key must be EXACTLY the same string

**Solution:** Verify key spelling, no dynamic keys

```typescript
// ✅ Static keys deduplicate
const key = 'fetch-data'
const first = await ctx.run(key, () => fetch('/api/data'))
const second = await ctx.run(key, () => fetch('/api/data'))
// Only first fetch executes
```

### Issue: Type errors with ctx.parallel()

**Symptom:** TypeScript can't infer result types

```typescript
const parallel = await ctx.parallel([
  ctx.exec(flowA, inputA),
  ctx.exec(flowB, inputB)
])

const resultA = parallel.results[0]  // Type: unknown
```

**Solution:** TypeScript limitation - explicitly type or destructure

```typescript
// ✅ Type assertion
const [resultA, resultB] = parallel.results as [ResultA, ResultB]

// ✅ Or access with type guard
if (parallel.results.length === 2) {
  const resultA = parallel.results[0] as ResultA
  const resultB = parallel.results[1] as ResultB
}
```

### Issue: ctx.get() returns undefined

**Symptom:** Tag not found in context

```typescript
const value = ctx.get(customTag)
// value === undefined
```

**Cause:** Tag not set, or accessed in wrong scope

**Solution:** Verify tag was set, check scope

```typescript
// ✅ Set before getting
ctx.set(customTag, 'value')
const value = ctx.get(customTag)

// ✅ Or use find() for optional access
const value = ctx.find(customTag)  // undefined if not set
```

### Issue: Journal not showing operations

**Symptom:** Journal empty or missing operations

```typescript
const metadata = await execution.ctx()
const journal = metadata?.context.find(flowMeta.journal)
// journal empty or undefined
```

**Cause:** Operations not journaled with `ctx.run()`

**Solution:** Wrap operations in `ctx.run()`

```typescript
// ❌ Not journaled
const result = await someOperation()

// ✅ Journaled
const result = await ctx.run('operation', () => someOperation())
```

---

## Related Sub-skills

- **flow-subflows.md** - Using `ctx.exec()` for sub-flow composition
- **testing-flows.md** - Testing flows and verifying journal entries
- **coding-standards.md** - Code economy rules for when to use ctx.run()
- **resource-basic.md** - Resource operations journaled via ctx.run()
