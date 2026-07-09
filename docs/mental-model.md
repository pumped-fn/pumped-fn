# What is the pumped-fn mental model?

Reader question: "What are scope, graph nodes, dependencies, and effects?"

Pillar proven: scope keeps testability, traceability, and readability tied together.

Entry arena: supports all entry pages.

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

## Dependency Kinds

| Kind | Meaning | Citation |
| --- | --- | --- |
| Static graph deps | Atoms, flows, controllers, and resources declared in `deps` | `[pkg/core/lite/src/deps-graph.ts:5-12](../pkg/core/lite/src/deps-graph.ts#L5-L12)`, `[pkg/core/lite/src/types.ts:530-555](../pkg/core/lite/src/types.ts#L530-L555)` |
| Required/optional/all tag deps | Typed ambient values declared as dependencies; a missing required tag fails deterministically at dependency resolution — loud and early, never silently `undefined` at use-site | `[pkg/core/lite/src/tag.ts:253-310](../pkg/core/lite/src/tag.ts#L253-L310)`, `[pkg/core/lite/src/scope.ts:1055-1068](../pkg/core/lite/src/scope.ts#L1055-L1068)`, `[pkg/core/lite/tests/scope.test.ts:1434-1465](../pkg/core/lite/tests/scope.test.ts#L1434-L1465)` |
| First-class async deps | Factories may return promises; resources are execution-context-owned | `[pkg/core/lite/src/types.ts:45-45](../pkg/core/lite/src/types.ts#L45-L45)`, `[pkg/core/lite/src/resource.ts:3-42](../pkg/core/lite/src/resource.ts#L3-L42)`, `[pkg/core/lite/src/scope.ts:1916-1933](../pkg/core/lite/src/scope.ts#L1916-L1933)` |
| Preset substitutions | A scope maps target handles to replacement values or handles | `[pkg/core/lite/src/scope.ts:380-380](../pkg/core/lite/src/scope.ts#L380-L380)`, `[pkg/core/lite/src/scope.ts:447-449](../pkg/core/lite/src/scope.ts#L447-L449)`, `[pkg/core/lite/src/preset.ts:69-84](../pkg/core/lite/src/preset.ts#L69-L84)` |
| Effects as graph edges | Flow/function execution goes through `ctx.exec`; extensions wrap the execution | `[pkg/core/lite/src/types.ts:233-245](../pkg/core/lite/src/types.ts#L233-L245)`, `[pkg/core/lite/src/scope.ts:2084-2131](../pkg/core/lite/src/scope.ts#L2084-L2131)`, `[pkg/core/lite/src/scope.ts:2377-2390](../pkg/core/lite/src/scope.ts#L2377-L2390)` |

## Claim -> Citation

The README defines scope, execution context, atoms, flows, resources, tags, presets, extensions, and streaming flows in one mental model: `[README.md:101-103](../README.md#L101-L103)`.

Scope is the composition and test boundary: `[README.md:101-103](../README.md#L101-L103)`, `[pkg/core/lite/README.md:36-48](../pkg/core/lite/README.md#L36-L48)`.

Raw ambient IO belongs in transport atoms or composition-root adapters, while feature code depends on capabilities: `[README.md:139-143](../README.md#L139-L143)`, `[pkg/core/lite/PATTERNS.md:9-19](../pkg/core/lite/PATTERNS.md#L9-L19)`.

Required tag deps currently fail during dependency resolution, not universal `createScope()` construction: `[pkg/core/lite/src/scope.ts:1055-1068](../pkg/core/lite/src/scope.ts#L1055-L1068)`.
