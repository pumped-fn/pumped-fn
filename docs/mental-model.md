# What is the pumped-fn mental model?

Think of pumped-fn as one explicit graph seam. You build a scope, create an execution context, and run graph edges through that context.

```text
composition root
  createScope({ presets, tags, extensions })
        |
        v
scope materialization
  atoms + controllers + long-lived cleanup
        |
        v
execution context
  flow execution + resources + runtime tags
        |
        v
extensions
  wrapResolve + wrapExec observe graph edges
```

Here is the same shape in code.

```ts
import { atom, createScope, flow, resource, tag, tags, typed } from "@pumped-fn/lite"

const tenant = tag<string>({ label: "tenant" })

const http = atom({
  factory: () => ({
    get: async (path: string) => `GET ${path}`,
  }),
})

const tx = resource({
  name: "tx",
  ownership: "current",
  factory: async (ctx) => {
    const calls: string[] = []
    ctx.cleanup(() => {
      calls.length = 0
    })
    return {
      async read(path: string) {
        calls.push(path)
        return path
      },
    }
  },
})

const load = flow({
  parse: typed<{ id: string }>(),
  deps: { http, tenant: tags.required(tenant), tx },
  factory: async (ctx, { http, tenant, tx }) => {
    await tx.read(ctx.input.id)
    return http.get(`/tenants/${tenant}/items/${ctx.input.id}`)
  },
})

const scope = createScope({ tags: [tenant("acme")] })
const ctx = scope.createContext()

await ctx.exec({ flow: load, input: { id: "42" } })

await ctx.close()
await scope.dispose()
```

The composition root creates the scope and supplies the tenant tag. The flow declares the HTTP client, tenant, and transaction resource in `deps`, so the execution context can resolve them before the factory runs. The resource is owned by the current execution context, so its cleanup runs when that context closes.

Extensions sit outside the business function. They can wrap dependency resolution and execution without changing the flow body.

> **Note:** Missing required tag deps fail during dependency resolution before the unit factory runs. The current source does not validate every required tag at `createScope()` construction.

## Recap

| Kind | Meaning |
| --- | --- |
| Static graph deps | Atoms, flows, controllers, and resources declared in `deps` |
| Required/optional/all tag deps | Typed ambient values declared as dependencies; a missing required tag fails deterministically at dependency resolution — loud and early, never silently `undefined` at use-site |
| First-class async deps | Factories may return promises; resources are execution-context-owned |
| Preset substitutions | A scope maps target handles to replacement values or handles |
| Effects as graph edges | Flow/function execution goes through `ctx.exec`; extensions wrap the execution |

Raw ambient IO belongs in transport atoms or composition-root adapters. Feature code should depend on capabilities declared in the graph.

## Source

- [Core README mental model](../README.md)
- [Dependency graph classification](../pkg/core/lite/src/deps-graph.ts)
- [Tag dependencies](../pkg/core/lite/src/tag.ts)
- [Resources](../pkg/core/lite/src/resource.ts)
- [Scope implementation](../pkg/core/lite/src/scope.ts)
- [Lite patterns](../pkg/core/lite/PATTERNS.md)

## Next

- [Test without mocking modules](test-without-mocks.md)
- [Adopt one route at a time](adopt-incrementally.md)
