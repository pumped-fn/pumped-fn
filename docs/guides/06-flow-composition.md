---
title: Flow Composition
description: Composing flows with ctx.exec and parallel execution
keywords: [flow, composition, ctx.exec, parallel]
---

# Flow Composition

Flows compose via `ctx.exec()` for sequential execution and `ctx.parallel()` for concurrent operations. Each subflow inherits parent context.

## Sequential Execution

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const step1 = flow((ctx, input: number) => input * 2)
const step2 = flow((ctx, input: number) => input + 10)

const combined = flow(async (ctx, input: number) => {
  const result1 = await ctx.exec(step1, input)
  const result2 = await ctx.exec(step2, result1)
  return result2
})
```

## Context Inheritance

Subflows inherit parent context tags:

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const subFlow = flow((ctx, _input: void) => {
  return ctx.get(userId)
})

const parent = flow(async (ctx, id: string) => {
  ctx.set(userId, id)
  return ctx.exec(subFlow, undefined)
})
```

## Parallel Execution

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const fetchUser = flow((ctx, id: string) => ({ id, name: 'User' }))
const fetchPosts = flow((ctx, userId: string) => [{ id: '1', title: 'Post' }])

const handler = flow(async (ctx, userId: string) => {
  const { results } = await ctx.parallel([
    ctx.exec(fetchUser, userId),
    ctx.exec(fetchPosts, userId)
  ])

  const [user, posts] = results
  return { user, posts }
})
```

## Error Handling in Composition

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const riskyStep = flow((ctx, shouldFail: boolean) => {
  if (shouldFail) throw new Error('Failed')
  return 'success'
})

const handler = flow(async (ctx, input: boolean) => {
  try {
    const result = await ctx.exec(riskyStep, input)
    return { status: 'ok', result }
  } catch (error) {
    return { status: 'error', message: (error as Error).message }
  }
})
```

## Complete Example

<<< @/../examples/http-server/flow-composition.ts

## Key Points

- `ctx.exec()` runs subflows sequentially
- `ctx.parallel()` runs operations concurrently
- Subflows inherit parent context
- Error handling with try/catch

## See Also

- [Flow Basics](./05-flow-basics.md)
- [Error Handling](./10-error-handling.md)
- [Promised API](./07-promised-api.md)
