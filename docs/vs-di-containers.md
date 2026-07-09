# TypeScript DI without decorators: why use pumped-fn instead of a container?

The repo-backed claim is about pumped-fn's shape: imports define graph units; dependency records define edges; a scope materializes one graph with substitutions.

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

## What This Proves

| Need | pumped-fn Shape |
| --- | --- |
| No decorator-shaped public API | Public exports are primitives such as `atom`, `flow`, `tag`, `preset`, `resource`, `createScope` |
| Inference-carried dependency values | Dependency records are classified by runtime handle type |
| Role selection | A tag can carry a flow and project to a context-bound `FlowHandle` in deps |
| Context override | Context tags can rebind a role for one request or test |
| Async deps | Atom, flow, and resource factories accept `MaybePromise` values |

## Caveat

Required tag deps do not fail at scope creation today. Current source proves a narrower and still useful claim: missing required tags throw during dependency resolution before the unit factory runs.

This page does not document tsyringe or InversifyJS internals. The repo-backed comparison is: pumped-fn's public API does not expose a decorator or registration surface in its core exports.

## Proven in the source

- No decorator-shaped public API: [pkg/core/lite/src/index.ts:16-22](../pkg/core/lite/src/index.ts#L16-L22).

- Inference-carried dependency values: [pkg/core/lite/src/deps-graph.ts:16-49](../pkg/core/lite/src/deps-graph.ts#L16-L49), [pkg/core/lite/src/types.ts:530-579](../pkg/core/lite/src/types.ts#L530-L579).

- Role selection: [pkg/core/lite/tests/role-tags.test.ts:10-26](../pkg/core/lite/tests/role-tags.test.ts#L10-L26), [pkg/core/lite/tests/role-tags.test.ts:59-71](../pkg/core/lite/tests/role-tags.test.ts#L59-L71).

- Context override: [pkg/core/lite/tests/role-tags.test.ts:128-142](../pkg/core/lite/tests/role-tags.test.ts#L128-L142), [pkg/core/lite/src/scope.ts:1814-1842](../pkg/core/lite/src/scope.ts#L1814-L1842).

- Async deps: [pkg/core/lite/src/atom.ts:29-44](../pkg/core/lite/src/atom.ts#L29-L44), [pkg/core/lite/src/flow.ts:146-212](../pkg/core/lite/src/flow.ts#L146-L212), [pkg/core/lite/src/resource.ts:25-42](../pkg/core/lite/src/resource.ts#L25-L42).

- Required tag timing: [pkg/core/lite/src/scope.ts:1055-1068](../pkg/core/lite/src/scope.ts#L1055-L1068).
