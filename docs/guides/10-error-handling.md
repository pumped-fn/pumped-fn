---
title: Error Handling
description: Error boundaries, recovery strategies, and cleanup
keywords: [errors, try-catch, cleanup, recovery]
---

# Error Handling

Handle errors at appropriate boundaries: flow try/catch for local recovery, extensions for cross-cutting concerns, finally blocks for cleanup.

## Flow-Level Recovery

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: { shouldFail: boolean }) => {
  try {
    if (input.shouldFail) {
      throw new Error('Operation failed')
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})
```

## Cleanup with Finally

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow(async (ctx, input: string) => {
  const resource = acquireResource()

  try {
    return processData(input, resource)
  } finally {
    resource.release()
  }
})

function acquireResource() {
  return { release: () => console.log('Released') }
}

function processData(input: string, resource: any) {
  return { data: input }
}
```

## Extension Error Boundaries

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const errorBoundary = extension({
  name: 'error-boundary',
  wrap: async (ctx, next, operation) => {
    try {
      return await next()
    } catch (error) {
      console.error('Caught error:', error)

      return {
        error: (error as Error).message,
        operation: operation.kind,
        timestamp: Date.now()
      }
    }
  }
})
```

## Subflow Error Propagation

Errors propagate from subflows to parent:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const subFlow = flow((ctx, shouldFail: boolean) => {
  if (shouldFail) {
    throw new Error('Subflow failed')
  }
  return 'success'
})

const parent = flow(async (ctx, input: boolean) => {
  try {
    const result = await ctx.exec(subFlow, input)
    return { status: 'ok', result }
  } catch (error) {
    return { status: 'error', message: (error as Error).message }
  }
})
```

## Scope Disposal Errors

Always dispose scopes, even on error:

```ts twoslash
import { createScope } from '@pumped-fn/core-next'

async function main() {
  const scope = createScope()

  try {
    // Use scope
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await scope.dispose()
  }
}
```

## Error Type Safety

Define error types for better handling:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const handler = flow((ctx, input: { value: number }) => {
  if (input.value < 0) {
    throw new ValidationError('Value must be positive')
  }

  return { result: input.value * 2 }
})

const wrapper = flow(async (ctx, input: { value: number }) => {
  try {
    return await ctx.exec(handler, input)
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: 'validation', message: error.message }
    }
    throw error
  }
})
```

## Complete Example

<<< @/../examples/http-server/error-handling.ts

## Key Points

- Use try/catch in flows for local recovery
- Extensions provide error boundaries
- Finally blocks guarantee cleanup
- Errors propagate through subflows
- Always dispose scopes in finally

## See Also

- [Flow Composition](./06-flow-composition.md)
- [Extensions](./09-extensions.md)
- [Scope Lifecycle](./03-scope-lifecycle.md)
