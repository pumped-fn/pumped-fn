# TypeScript DI without decorators: why use pumped-fn instead of a container?

pumped-fn's core API is imports, dependency records, and scopes. Imports define graph units, dependency records define edges, and a scope materializes one graph with substitutions.

```ts
import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"

const openAi = flow({
  name: "model.openai",
  parse: typed<{ prompt: string }>(),
  factory: (ctx) => `openai:${ctx.input.prompt}`,
})

const fake = flow({
  name: "model.fake",
  parse: typed<{ prompt: string }>(),
  factory: (ctx) => `fake:${ctx.input.prompt}`,
})

const model = tag<typeof openAi>({ label: "model" })

const summarize = flow({
  parse: typed<{ prompt: string }>(),
  deps: { model: tags.required(model) },
  factory: (ctx, { model }) => model.exec({ input: ctx.input }),
})

const scope = createScope({ tags: [model(fake)] })
const ctx = scope.createContext()
const result = await ctx.exec({ flow: summarize, input: { prompt: "hello" } })

if (result !== "fake:hello") throw new Error("unexpected model")

await ctx.close()
await scope.dispose()
```

The root chooses the model by setting a tag. The feature flow depends on the role, not on a decorator container or a global registry. In a request or test, you can rebind the role by creating a context with different tags.

> **Note:** Required tag deps do not fail at scope creation today. Missing required tags throw during dependency resolution before the unit factory runs.

## What You Get

| Need | pumped-fn Shape |
| --- | --- |
| No decorator-shaped public API | Public exports are primitives such as `atom`, `flow`, `tag`, `preset`, `resource`, `createScope` |
| Inference-carried dependency values | Dependency records are classified by runtime handle type |
| Role selection | A tag can carry a flow and project to a context-bound `FlowHandle` in deps |
| Context override | Context tags can rebind a role for one request or test |
| Async deps | Atom, flow, and resource factories accept `MaybePromise` values |

This page does not document tsyringe or InversifyJS internals. The comparison here is limited to pumped-fn's core exports: they expose primitives such as `atom`, `flow`, `tag`, `preset`, `resource`, and `createScope`, not a decorator or registration surface.

## Source

- [Core exports](../pkg/core/lite/src/index.ts)
- [Dependency classification](../pkg/core/lite/src/deps-graph.ts)
- [Dependency types](../pkg/core/lite/src/types.ts)
- [Role tag tests](../pkg/core/lite/tests/role-tags.test.ts)
- [Scope implementation](../pkg/core/lite/src/scope.ts)
- [Required tag timing](../pkg/core/lite/src/scope.ts)

## Next

- [Mental model](mental-model.md)
- [Test without mocking modules](test-without-mocks.md)
