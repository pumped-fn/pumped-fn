---
name: extension-basics
tags: extension, add, cross-cutting, wrap, logging, metrics, tracing, observability, hooks
description: Creating extensions with extension() and wrap() for cross-cutting concerns (logging, metrics, tracing). Includes execute and journal hooks, operation interception, and extension composition patterns.
---

# Extension: Basics

## When to Use

Use extensions when:

- Adding observability (logging, metrics, tracing) to flows
- Cross-cutting concerns that apply to all or many flows
- Capturing execution metadata without modifying flow logic
- Performance monitoring and profiling
- Error tracking and reporting
- Auditing flow executions

**Don't use for:**
- Flow-specific logic (belongs in flow body)
- Business rules (belongs in flows)
- Resource management (use provide/derive with cleanup)
- Modifying flow behavior (extensions are observers, not modifiers)

---

## Code Template


See: `loggingExtension` in skill-examples/extensions.ts

```typescript
import { extension } from '@pumped-fn/core-next'

// Basic logging extension
export const loggingExtension = extension({
  name: 'logging',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      console.log(`[FLOW START] ${operation.target.definition.name}`, {
        input: operation.input
      })

      return next()
        .then((result) => {
          console.log(`[FLOW END] ${operation.target.definition.name}`, {
            result
          })
          return result
        })
        .catch((error) => {
          console.error(`[FLOW ERROR] ${operation.target.definition.name}`, {
            error
          })
          throw error
        })
    }

    if (operation.kind === 'execution' && operation.target.type === 'fn' && operation.key) {
      console.log(`  [STEP] ${operation.key}`)
    }

    return next()
  }
})
```

---

## Operation Types

Extensions intercept two kinds of operations:

### 1. Resolve Operations
- `kind: "resolve"` - Executor resolution at scope level
- Fields: `executor`, `scope`, `operation: "resolve" | "update"`

### 2. Execution Operations
- `kind: "execution"` - Flow/function/parallel execution
- Fields: `target`, `input`, `key?`, `context`

Target types discriminate execution purpose:
- `{ type: "flow", flow, definition }` - Flow execution (ctx.exec or top-level)
- `{ type: "fn", params? }` - Function execution (ctx.run)
- `{ type: "parallel", mode, count }` - Parallel coordination (ctx.parallel/parallelSettled)

Named operations have `key` defined (for journaling/replay).
Nesting context available via `operation.context.get(flowMeta.depth.key)`.

---

## Extension Hooks

### Flow Execution Hook

Intercepts flow execution (both top-level and sub-flows):

```typescript
const metricsExtension = extension({
  name: 'metrics',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const startTime = Date.now()
      const flowName = operation.target.definition.name

      return next()
        .then((result) => {
          const duration = Date.now() - startTime
          console.log(`METRIC: flow.${flowName}.duration = ${duration}ms`)
          return result
        })
        .catch((error) => {
          const duration = Date.now() - startTime
          console.log(`METRIC: flow.${flowName}.duration = ${duration}ms (error)`)
          console.log(`METRIC: flow.${flowName}.errors = 1`)
          throw error
        })
    }

    return next()
  }
})
```

### Function (Journal) Hook

Intercepts ctx.run() operations:


See: `journalCaptureExtension` in skill-examples/extensions.ts

```typescript
const journalCaptureExtension = extension({
  name: 'journal-capture',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'fn' && operation.key) {
      const record = {
        key: operation.key,
        params: operation.target.params
      }

      return next()
        .then((result) => {
          console.log(`Journal: ${operation.key}`, {
            params: operation.target.params,
            output: result
          })
          return result
        })
    }

    return next()
  }
})
```

### Parallel Hook

Intercepts ctx.parallel() and ctx.parallelSettled():


See: `parallelTrackerExtension` in skill-examples/extensions.ts

```typescript
const parallelTrackerExtension = extension({
  name: 'parallel-tracker',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'parallel') {
      console.log(`[PARALLEL] mode=${operation.target.mode} count=${operation.target.count}`)

      return next()
        .then((result) => {
          console.log(`[PARALLEL COMPLETE] ${operation.target.count} promises resolved`)
          return result
        })
    }

    return next()
  }
})
```

---

## Real Examples from Pumped-fn Tests

### Example 1: Journal Capture with Parameters (packages/next/tests/extensions.test.ts)

```typescript
type JournalRecord = {
  key: string
  params?: readonly unknown[]
  output?: unknown
}

const capturedJournalRecords: JournalRecord[] = []

const journalCaptureExtension = extension({
  name: "journal-capture",
  wrap: (_scope, next, operation) => {
    if (operation.kind === "execution" && operation.target.type === "fn" && operation.key) {
      const record: JournalRecord = {
        key: operation.key,
        params: operation.target.params,
      }

      return next()
        .then((result) => {
          record.output = result
          capturedJournalRecords.push(record)
          return result
        })
        .catch((error) => {
          capturedJournalRecords.push(record)
          throw error
        })
    }
    return next()
  },
})

const mathCalculationFlow = flow(async (ctx, input: { x: number; y: number }) => {
  const product = await ctx.run("multiply", (a: number, b: number) => a * b, input.x, input.y)
  const sum = await ctx.run("add", (a: number, b: number) => a + b, input.x, input.y)
  const combined = await ctx.run("combine", () => product + sum)

  return { product, sum, combined }
})

const result = await flow.execute(
  mathCalculationFlow,
  { x: 5, y: 3 },
  { extensions: [journalCaptureExtension] }
)

// capturedJournalRecords contains:
// [
//   { key: "multiply", params: [5, 3], output: 15 },
//   { key: "add", params: [5, 3], output: 8 },
//   { key: "combine", params: undefined, output: 23 }
// ]
```

### Example 2: Input Capture for Flows and Subflows (packages/next/tests/extensions.test.ts)

```typescript
const capturedFlowInputs: Array<{ operation: string; input: unknown }> = []

const inputCaptureExtension = extension({
  name: "input-capture",
  wrap: (_scope, next, operation) => {
    if (operation.kind === "execution" && operation.target.type === "flow") {
      const opType = operation.key === undefined ? "execute" : "subflow"
      capturedFlowInputs.push({
        operation: `${opType}:${operation.target.definition.name}`,
        input: operation.input,
      })
    }
    return next()
  },
})

const incrementFlow = flow((_ctx, x: number) => x + 1)
const doubleFlow = flow((_ctx, x: number) => x * 2)

const composedFlow = flow(async (ctx, input: { value: number }) => {
  const incremented = await ctx.exec(incrementFlow, input.value)
  const doubled = await ctx.exec(doubleFlow, incremented)

  return { original: input.value, result: doubled }
})

const result = await flow.execute(
  composedFlow,
  { value: 5 },
  { extensions: [inputCaptureExtension] }
)

// capturedFlowInputs contains:
// [
//   { operation: "execute:anonymous", input: { value: 5 } },
//   { operation: "subflow:anonymous", input: 5 },
//   { operation: "execute:anonymous", input: 5 },
//   { operation: "subflow:anonymous", input: 6 },
//   { operation: "execute:anonymous", input: 6 }
// ]
```

### Example 3: Comprehensive Operation Tracker (packages/next/tests/extensions.test.ts)

```typescript
type OperationRecord = {
  kind: string
  targetType?: "flow" | "fn" | "parallel"
  flowName?: string
  key?: string
  input?: unknown
  output?: unknown
  error?: unknown
  parallelMode?: string
  count?: number
}

const capturedOperations: OperationRecord[] = []

const comprehensiveTracker = extension({
  name: "tracker",
  wrap: (_scope, next, operation) => {
    const record: OperationRecord = { kind: operation.kind }

    if (operation.kind === "execution") {
      record.targetType = operation.target.type
      record.input = operation.input
      record.key = operation.key

      if (operation.target.type === "flow") {
        record.flowName = operation.target.definition.name
      } else if (operation.target.type === "parallel") {
        record.parallelMode = operation.target.mode
        record.count = operation.target.count
      }
    }

    return next()
      .then((result) => {
        record.output = result
        capturedOperations.push(record)
        return result
      })
      .catch((error) => {
        record.error = error
        capturedOperations.push(record)
        throw error
      })
  },
})
```

---

## Cross-Cutting Concerns Patterns

### Logging Extension

```typescript
export const loggingExtension = extension({
  name: 'logging',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const startTime = Date.now()
      console.log(`[FLOW START] ${operation.target.definition.name}`, { input: operation.input })

      return next()
        .then((result) => {
          const duration = Date.now() - startTime
          console.log(`[FLOW END] ${operation.target.definition.name}`, { duration, result })
          return result
        })
        .catch((error) => {
          const duration = Date.now() - startTime
          console.error(`[FLOW ERROR] ${operation.target.definition.name}`, { duration, error })
          throw error
        })
    }

    if (operation.kind === 'execution' && operation.target.type === 'fn' && operation.key) {
      console.log(`  [STEP] ${operation.key}`)
    }

    return next()
  }
})
```

### Metrics/Instrumentation Extension

```typescript
export const metricsExtension = extension({
  name: 'metrics',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const startTime = Date.now()
      const metricName = `flow.${operation.target.definition.name}.duration`

      return next()
        .then((result) => {
          const duration = Date.now() - startTime
          console.log(`METRIC: ${metricName} = ${duration}ms`)
          return result
        })
        .catch((error) => {
          const duration = Date.now() - startTime
          console.log(`METRIC: ${metricName} = ${duration}ms (error)`)
          console.log(`METRIC: flow.${operation.target.definition.name}.errors = 1`)
          throw error
        })
    }

    return next()
  }
})
```

### Tracing Extension

```typescript
export const tracingExtension = extension({
  name: 'tracing',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const traceId = Math.random().toString(36).slice(2)
      const spanId = Math.random().toString(36).slice(2)

      console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${operation.target.definition.name} phase=start`)

      return next()
        .then((result) => {
          console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${operation.target.definition.name} phase=end`)
          return result
        })
        .catch((error) => {
          console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${operation.target.definition.name} phase=error error=${error}`)
          throw error
        })
    }

    if (operation.kind === 'execution' && operation.target.type === 'fn' && operation.key) {
      console.log(`[TRACE] operation=${operation.key}`)
    }

    return next()
  }
})
```

### Error Tracking Extension

```typescript
export const errorTrackingExtension = extension({
  name: 'error-tracking',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      return next()
        .catch((error) => {
          console.error(`[ERROR TRACKING] Flow: ${operation.target.definition.name}`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          })
          throw error
        })
    }

    return next()
  }
})
```

---

## Extension Composition

Multiple extensions work together:

```typescript
const scope = createScope({
  extensions: [
    loggingExtension,
    metricsExtension,
    tracingExtension,
    errorTrackingExtension
  ]
})

const result = await scope.exec(processOrder, {
  orderId: 'order-123',
  items: ['item1', 'item2']
})
```

Extensions execute in order:
1. First extension wraps next (includes remaining extensions + flow)
2. Second extension wraps next (includes remaining extensions + flow)
3. Third extension wraps next (includes remaining extensions + flow)
4. Fourth extension wraps next (includes flow only)
5. Flow executes

On return, each extension's `.then()` callback fires in reverse order.

---

## Usage Patterns

### At Scope Creation

```typescript
import { createScope } from '@pumped-fn/core-next'
import { loggingExtension, metricsExtension } from './extensions'

const scope = createScope({
  extensions: [loggingExtension, metricsExtension]
})

const result = await scope.exec(createUser, {
  email: 'test@example.com',
  name: 'Test User'
})
```

### At Flow Execution (flow.execute)

```typescript
const result = await flow.execute(
  processOrder,
  { orderId: 'order-123' },
  { extensions: [loggingExtension, metricsExtension] }
)
```

---

## Troubleshooting

### Extension Not Firing

**Problem:** Extension wrap() not called

**Solutions:**
- Verify extension passed to createScope() or flow.execute()
- Check operation.kind matches your condition
- Ensure next() is called in all code paths

```typescript
// ❌ Wrong - next() not called in all paths
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    console.log('Execute')
    return next()
  }
  // Missing return next() for other operation kinds
}

// ✅ Correct - next() called for all operations
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    console.log('Execute')
  }
  return next()
}
```

### Extension Errors Breaking Flows

**Problem:** Extension throws, crashes flow

**Solutions:**
- Wrap extension logic in try/catch
- Never throw from extensions (log errors instead)
- Always call next() even if extension logic fails

```typescript
// ✅ Safe extension
wrap: (scope, next, operation) => {
  try {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      // Extension logic might fail
      logToExternalService(operation)
    }
  } catch (error) {
    // Log but don't crash
    console.error('Extension error:', error)
  }

  return next()
}
```

### Extension Modifying Results

**Problem:** Extension accidentally modifies flow results

**Solutions:**
- Extensions should observe, not modify
- Don't mutate operation.input or result
- Use .then() to observe, not transform

```typescript
// ❌ Wrong - modifying result
wrap: (scope, next, operation) => {
  return next()
    .then((result) => {
      result.modified = true  // Mutation!
      return result
    })
}

// ✅ Correct - observing only
wrap: (scope, next, operation) => {
  return next()
    .then((result) => {
      console.log('Result:', result)  // Observe
      return result  // Return unchanged
    })
}
```

### Extension Order Matters

**Problem:** Extensions in wrong order produce unexpected behavior

**Solutions:**
- Put tracing/correlation first (sets context)
- Put logging/metrics after (uses context)
- Put error tracking last (catches all errors)

```typescript
// ✅ Correct order
const scope = createScope({
  extensions: [
    tracingExtension,      // First: sets trace context
    loggingExtension,      // Second: logs with trace context
    metricsExtension,      // Third: records metrics
    errorTrackingExtension // Last: catches all errors
  ]
})
```

---

## Anti-patterns

### ❌ Don't Use Extensions for Business Logic

```typescript
// ❌ Wrong - business logic in extension
const validationExtension = extension({
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow' && operation.input.email) {
      if (!operation.input.email.includes('@')) {
        throw new Error('Invalid email')  // Business logic!
      }
    }
    return next()
  }
})

// ✅ Correct - validation in flow
const createUserFlow = flow(async (ctx, input) => {
  if (!input.email.includes('@')) {
    return { success: false, reason: 'INVALID_EMAIL' }
  }
  // Continue...
})
```

### ❌ Don't Mutate Operation Data

```typescript
// ❌ Wrong - mutating input
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    operation.input.timestamp = Date.now()  // Mutation!
  }
  return next()
}

// ✅ Correct - observe only
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    console.log('Input received at', Date.now())
  }
  return next()
}
```

### ❌ Don't Forget to Call next()

```typescript
// ❌ Wrong - next() not called
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    console.log('Execute')
  }
  // Missing return next()!
}

// ✅ Correct - always call next()
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    console.log('Execute')
  }
  return next()
}
```

---

## Related Sub-skills

- **entrypoint-patterns** - Attaching extensions to scope at app initialization
- **testing-flows** - Testing flows with extensions enabled
- **flow-context** - Understanding ctx.run() and ctx.exec() that extensions intercept
