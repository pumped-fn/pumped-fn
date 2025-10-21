---
title: Flow Basics
description: Short-lived operations with flow context
keywords: [flow, context, execution]
---

# Flow Basics

Flows handle short-lived operations like HTTP requests, background jobs, or individual transactions. Each flow gets isolated context for tags and nested execution.

## Core Pattern

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: { value: number }) => {
  return { result: input.value * 2 }
})

const result = await flow.execute(handler, { value: 21 })
```

## Flow with Dependencies

Flows can depend on executors:

```ts twoslash
import { flow, provide, derive } from '@pumped-fn/core-next'

const config = provide(() => ({ multiplier: 3 }))
const calculator = derive(config, (cfg) => ({
  multiply: (n: number) => n * cfg.multiplier
}))

const handler = flow({ calculator }, (deps, ctx, input: number) => {
  return deps.calculator.multiply(input)
})
```

## Flow Context

Context provides tag access and subflow execution:

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const handler = flow((ctx, input: string) => {
  ctx.set(userId, input)
  const id = ctx.get(userId)

  return { userId: id }
})
```

## Type Inference

Flow types infer from implementation:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: { name: string }) => {
  return { greeting: `Hello, ${input.name}` }
})
```

The return type is automatically `{ greeting: string }`.

## Execution Options

```ts twoslash
import { flow, createScope, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })
const handler = flow((ctx, input: number) => input * 2)

const scope = createScope()

const result = await flow.execute(handler, 42, {
  scope,
  tags: [requestId('req-123')]
})

await scope.dispose()
```

## Complete Example

<<< @/../examples/http-server/basic-handler.ts

## Key Points

- Flows handle short-lived operations
- Context isolates data per execution
- Dependencies pull from scope
- Full type inference on inputs/outputs

## See Also

- [Flow Composition](./06-flow-composition.md)
- [Tags: The Type System](./02-tags-the-type-system.md)
- [Promised API](./07-promised-api.md)
