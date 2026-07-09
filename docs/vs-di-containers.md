# TypeScript DI without decorators: why use pumped-fn instead of a container?

Use pumped-fn when the container question is really a testability question. The goal is not "no decorators" by itself; the goal is one graph seam where hidden IO, async setup, substitutions, and request facts become visible.

## 1. Footguns

Start with the common footgun: time hidden inside a function.

```ts
import { createScope, flow, tag, tags } from "@pumped-fn/lite"

const clock = tag<{ now(): Date }>({ label: "clock" })

const createdAt = flow({
  deps: { clock: tags.required(clock) },
  factory: (_, { clock }) => clock.now().toISOString(),
})

const scope = createScope({
  tags: [clock({ now: () => new Date("2026-07-09T00:00:00.000Z") })],
})
const ctx = scope.createContext()
const value = await ctx.exec({ flow: createdAt })

if (value !== "2026-07-09T00:00:00.000Z") throw new Error("unexpected time")

await ctx.close()
await scope.dispose()
```

`Date.now()` never appears in feature code. The request or test supplies the clock at the graph boundary, and missing request facts fail during dependency resolution.

tsyringe documents decorator APIs plus container registration and resolution in its README: [tsyringe API](https://github.com/microsoft/tsyringe#api). InversifyJS starts from decorators, a `Container`, `bind`, and `get`, and its getting-started page calls out TypeScript decorator metadata settings: [InversifyJS getting started](https://inversify.io/docs/introduction/getting-started/). In either setup, check your own code for ambient reads such as `process.env`, `Date.now`, `fetch`, and module singletons; if they bypass the registered graph, the container cannot be the test seam for them.

## 2. Async DI

Make the dependency handshake part of resolution.

```ts
import { atom, createScope, flow, typed } from "@pumped-fn/lite"

type Client = {
  request(path: string): Promise<string>
  close(): Promise<void>
}

const client = atom({
  factory: async (ctx): Promise<Client> => {
    const connected: Client = {
      request: async (path) => `ok:${path}`,
      close: async () => undefined,
    }
    ctx.cleanup(() => connected.close())
    return connected
  },
})

const load = flow({
  parse: typed<{ id: string }>(),
  deps: { client },
  factory: (ctx, { client }) => client.request(`/users/${ctx.input.id}`),
})

const scope = createScope()
const ctx = scope.createContext()
const value = await ctx.exec({ flow: load, input: { id: "u1" } })

if (value !== "ok:/users/u1") throw new Error("unexpected value")

await ctx.close()
await scope.dispose()
```

The async factory, consumer, and cleanup are all on the graph path. There is no separate bootstrap variable that tests have to patch before import time.

InversifyJS documents async resolution with `getAsync`, `getAllAsync`, and asynchronously resolved bindings: [container API](https://inversify.io/docs/api/container/), [binding fundamentals](https://inversify.io/docs/fundamentals/binding/). For tsyringe setups, do the setup check in your app: when a provider must connect or handshake, where is it awaited, and can the first consumer observe an unready value?

## 3. One Scope

Put substitutions, default tags, and extensions on one access point.

```ts
import { atom, createScope, flow, preset, tag, tags } from "@pumped-fn/lite"

const tenant = tag<string>({ label: "tenant" })

const endpoint = atom({
  factory: () => "prod",
})

const route = flow({
  deps: {
    endpoint,
    tenant: tags.required(tenant),
  },
  factory: (_, { endpoint, tenant }) => `${endpoint}:${tenant}`,
})

const scope = createScope({
  presets: [preset(endpoint, "test")],
  tags: [tenant("acme")],
  extensions: [],
})
const ctx = scope.createContext()
const value = await ctx.exec({ flow: route })

if (value !== "test:acme") throw new Error("unexpected route")

await ctx.close()
await scope.dispose()
```

`createScope({ presets, tags, extensions })` is the single place where this graph materializes. Tests use the same imported flow and replace only the edge they care about.

tsyringe documents child containers with parent fallback during resolution: [child containers](https://github.com/microsoft/tsyringe#child-containers). InversifyJS documents parent containers, current-bound checks, and async module loading on the container API page: [container API](https://inversify.io/docs/api/container/). For any container setup, ask where a missing token fails: while composing the root, while creating a request container, or at the first `resolve` or `get`.

## 4. Static and Dynamic Dependencies

Use normal `deps` for known edges, and tags when the role shape is known but the value should come from the root, request, or test.

```ts
import { atom, createScope, flow, tag, tags, typed } from "@pumped-fn/lite"

const prefix = atom({
  factory: () => "summary",
})

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
  deps: {
    prefix,
    model: tags.required(model),
  },
  factory: async (ctx, { prefix, model }) => `${prefix}:${await model.exec({ input: ctx.input })}`,
})

const scope = createScope({ tags: [model(fake)] })
const ctx = scope.createContext()
const result = await ctx.exec({ flow: summarize, input: { prompt: "hello" } })

if (result !== "summary:fake:hello") throw new Error("unexpected model")

await ctx.close()
await scope.dispose()
```

`prefix` is static: the flow imports the edge it needs. `model` is dynamic: the flow says it needs something with the model shape, and the scope or request chooses the implementation.

tsyringe documents injection tokens and providers in its container API: [tsyringe API](https://github.com/microsoft/tsyringe#api). InversifyJS documents service identifiers and binding scopes in its binding fundamentals: [binding fundamentals](https://inversify.io/docs/fundamentals/binding/). For dynamic request facts, check whether your container setup registers them per request, passes them as method input, or reads them ambiently; that answer decides whether the value is testable through the same seam.

## Source

- [Core exports](../pkg/core/lite/src/index.ts)
- [Dependency classification](../pkg/core/lite/src/deps-graph.ts)
- [Role tag tests](../pkg/core/lite/tests/role-tags.test.ts)
- [tsyringe README](https://github.com/microsoft/tsyringe#api)
- [InversifyJS getting started](https://inversify.io/docs/introduction/getting-started/)
- [InversifyJS binding fundamentals](https://inversify.io/docs/fundamentals/binding/)

## Next

- [Mental model](mental-model.md)
- [Test without mocking modules](test-without-mocks.md)
