# @pumped-fn/lite

`@pumped-fn/lite` is the core runtime for scoped application graphs in TypeScript.

It gives you a small set of primitives for long-lived dependencies, short-lived execution, contextual
values, lifecycle cleanup, opt-in reactivity, and test seams. The same graph can run in server handlers,
BFF routes, workers, CLIs, React roots, and tests.

## Install

```bash
npm install @pumped-fn/lite
```

```bash
npx @pumped-fn/lite
npx @pumped-fn/lite primitives
npx @pumped-fn/lite diagrams
```

## What It Owns

Lite owns the application boundary below framework adapters:

- A `Scope` owns long-lived graph values and their cleanup.
- An `ExecutionContext` owns one request, job, command, action, or UI boundary.
- `atom()` defines scope-owned transports, capabilities, state, derived data, and caches.
- `flow()` defines execution work with optional typed or parsed input.
- `resource()` defines execution-context-owned values such as transactions, request loggers, spans, action buffers, and drafts.
- `tag()` carries typed ambient values such as tenant, trace id, locale, config, and equality-aware boundary identity.
- `preset()` swaps atoms, flows, and resources at the scope seam for tests or composition.
- Extensions wrap resolve and exec for logging, tracing, auth, metrics, and transactional policy.
- Controllers and selects add reactivity where it is intentional. `controller(flow, defaults)` only
  preconfigures child-flow execution; it is not reactive.

## Boundary Ownership

Scope is the composition and test seam. Composition roots, tests, and boundary adapters call
`createScope({ presets, tags, extensions })`.

Composition roots are thin, tested adapters. They create scopes, root contexts, providers, route/job
mounts, and disposal. `scope` is not a product helper argument; that turns the graph into a service
locator. Make the behavior an atom, flow, resource, pure helper called by a graph node, or route it
through flows, `ctx.exec`, resources, or providers.

Tests use the same seam. Inside-out tests preset direct dependencies. Outside-in tests preset only edge
adapters. A test that needs module mocks, global patches above raw transport wrappers, internal reaches,
or test-only product branches means the boundary leaked.

Raw ambient IO belongs in transport atoms or composition-root adapters. Capability atoms depend on transports.
Feature atoms depend on capabilities.

Public examples with strong architectural claims need structural guards, and inventories or implemented
slice claims should be derived or explicitly scoped.

## Shape

```text
composition root
  createScope({ presets, tags, extensions })
        |
        v
scope
  atom graph: transports, capabilities, state, derived data
  controller/select: opt-in reactivity
  changes/resolveStream/drain: async-iterator consumption
        |
        v
execution context
  flow execution
  resource ownership
  runtime tags
  onClose/cleanup
```

The usual layering is:

| Layer | Responsibility |
| --- | --- |
| Transport atom | Raw ambient IO such as network, clock, storage, random, process APIs |
| Capability atom | Domain/application operations built on transport atoms |
| Feature atom or flow | User-facing state, decisions, derived data, and use-case execution |
| Composition root | Scope creation, root execution context, providers, route/job mounting, disposal |

Feature nodes should depend on capabilities, not raw transports plus auth/session/token plumbing.

## First Graph

```ts
import { atom, controller, createScope, flow, tag, tags, typed } from "@pumped-fn/lite"

type User = { id: string; name: string }

const tenant = tag<string>({ label: "tenant" })

const http = atom({
  factory: () => ({
    getUser: async (tenantId: string, id: string): Promise<User> => ({
      id,
      name: `${tenantId}:${id}`,
    }),
  }),
})

const users = atom({
  deps: { http, tenant: tags.required(tenant) },
  factory: (_ctx, deps) => ({
    byId: (id: string) => deps.http.getUser(deps.tenant, id),
  }),
})

const loadUser = flow({
  parse: typed<{ id: string }>(),
  deps: { users },
  factory: (ctx, deps) => deps.users.byId(ctx.input.id),
})

const scope = createScope({ tags: [tenant("acme")] })
const ctx = scope.createContext()
const user = await ctx.exec({ flow: loadUser, input: { id: "u1" } })

if (user.name !== "acme:u1") throw new Error("unexpected user")

await ctx.close()
await scope.dispose()
```

What this demonstrates:

- `tenant` is ambient config, declared as a tag and requested by dependency.
- `http` is a transport atom. In real code, this is where fetch, storage, process, or clock APIs belong.
- `users` is a capability atom. It exposes domain operations without exposing transport plumbing.
- `loadUser` is a flow. It receives input through an execution context and uses declared dependencies.
- The composition root chooses the tenant and owns cleanup.

Flows compose through dependencies. The dependency value is a context-bound handle, so nested execution
keeps the `ctx.exec` options shape, parsing, presets, extensions, tags, and resource cleanup while making
the flow edge visible.

```ts
const auditUserLoad = flow({
  parse: typed<{ id: string }>(),
  factory: (ctx) => `audit:${ctx.input.id}`,
})

const auditedUsers = atom({
  factory: () => ({
    byId: (id: string) => ({ id, name: `user:${id}` }),
  }),
})

const loadAuditedUser = flow({
  parse: typed<{ id: string }>(),
  deps: { auditUserLoad, users: auditedUsers },
  factory: async (ctx, deps) => {
    await deps.auditUserLoad.exec({ input: { id: ctx.input.id } })
    return deps.users.byId(ctx.input.id)
  },
})

const plannedAudit = flow({
  parse: typed<{ id: string }>(),
  deps: {
    auditUserLoad: controller(auditUserLoad, { name: "audit-user-load" }),
  },
  factory: async (ctx, deps) => {
    const step = deps.auditUserLoad.prepare({ key: `audit:${ctx.input.id}`, input: { id: ctx.input.id } })
    await step.ready
    return step.exec()
  },
})
```

## Execution-Scoped Resources

Use `resource()` for values below the scope. Resources are not stored in `ctx.data` and are not owned by
controllers. The resolved value lives on the owning execution context.

Choose ownership by user expectation:

| Ownership | User expectation | Examples |
| --- | --- | --- |
| `boundary` | Work inside one request, job, or UI boundary sees the same value and closes it together | Request logger, trace data, per-request client, UI session |
| `current` | One action or editor gets a private pocket; nested `ctx.exec()` children can use it, siblings reset | Transaction, action audit buffer, form draft, modal/editor state |

```ts
import { createScope, flow, resource } from "@pumped-fn/lite"

const events: string[] = []

const tx = resource({
  name: "tx",
  ownership: "current",
  factory: (ctx) => {
    const tx = {
      commit() {
        events.push("commit")
      },
      rollback() {
        events.push("rollback")
      },
      release() {
        events.push("release")
      },
    }
    ctx.onClose((result) => result.ok ? tx.commit() : tx.rollback())
    ctx.cleanup(() => tx.release())
    return tx
  },
})

const save = flow({
  deps: { tx },
  factory: () => "saved",
})

const scope = createScope()
const ctx = scope.createContext()
await ctx.exec({ flow: save })
await ctx.close()
await scope.dispose()

if (events.join(",") !== "commit,release") throw new Error("unexpected lifecycle")
```

`ctx.release(resource)` is an owner-local reset. It runs the resource cleanup for that owner, but `onClose`
handlers registered by that resource still belong to the execution context. Use it when you intentionally
need a fresh resource instance inside an open context.

Resource controllers are infrastructure handles for observing a resource visible from one execution
context. Prefer direct resource dependencies, flows, or domain actions in product APIs. `watch: true` for
resource controllers is valid inside resource dependencies, where it releases the dependent resource after
a watched value changes. Flows do not get reactive resource-controller deps; use `controller(flow, defaults)`
only to preconfigure child-flow `exec()`/`prepare()` defaults.

## Tags

Tags carry typed ambient values through scopes and execution contexts. Use them for config and runtime
metadata that should not be parameter-drilled.

Tags can define `eq` for value equality inside that tag family. `tag.eq(a, b)` compares raw values.
`tag.same(left, right)` first checks both tagged records belong to that family, then uses `eq`.

Equality is intentionally narrow. It does not change tag lookup, defaults, parsing, `tags.all()`,
`tags.required()`, cache identity, or resource sharing. Equal values should be fully substitutable for
every consumer of that tag.

```ts
import { createScope, flow, tag, tags } from "@pumped-fn/lite"

const account = tag<{ id: string; version: number }>({
  label: "account",
  eq: (a, b) => a.id === b.id,
})

const readAccount = flow({
  deps: { account: tags.required(account) },
  factory: (_ctx, deps) => deps.account.id,
})

const same = account.same(
  account({ id: "acct_1", version: 1 }),
  account({ id: "acct_1", version: 2 }),
)

if (!same) throw new Error("expected equal account tags")

const scope = createScope({ tags: [account({ id: "acct_1", version: 1 })] })
const ctx = scope.createContext()
const id = await ctx.exec({ flow: readAccount })

if (id !== "acct_1") throw new Error("unexpected account id")

await ctx.close()
await scope.dispose()
```

## Reactivity

Atoms are cached values by default. Reactivity is opt-in through controllers and select handles.

Use a controller when the application intentionally updates or invalidates atom state after initial
resolution. Use `select(atom, selector, { eq })` when observers only need a derived slice.

```ts
import { atom, createScope } from "@pumped-fn/lite"

const counter = atom({
  factory: () => 0,
})

const scope = createScope()
const ctrl = await scope.controller(counter, { resolve: true })
const selected = scope.select(counter, (value) => value % 2)

ctrl.set(1)
if (selected.get() !== 1) throw new Error("expected odd")

ctrl.update((value) => value + 1)
if (selected.get() !== 0) throw new Error("expected even")

selected.dispose()
await scope.dispose()
```

Use `controller(dep, { resolve: true, watch: true, eq })` in atom dependencies for derived atoms that
should invalidate when a dependency changes. That replaces manual subscription wiring and automatically
cleans up on re-resolve, release, and dispose.

### Async Iteration

Every subscription surface is also consumable as an async iterator. `scope.changes(atom)` yields values
as the atom resolves, sets, and invalidates; `scope.changes(handle)` iterates a select slice;
`scope.changes(atom, { states: true })` yields state transitions with errors as data. Iteration conflates
to the latest value: a slow consumer skips intermediates and never buffers unboundedly.

```ts
import { atom, createScope } from "@pumped-fn/lite"

const config = atom({ factory: () => ({ level: "info" }) })

const scope = createScope()
for await (const value of scope.changes(config)) {
  applyLogLevel(value.level)
}
```

Loops terminate with `done` on `scope.dispose()`. Inside flows and resources, `ctx.changes(...)` binds the
loop to the execution context instead, ending it at `ctx.close()`. Breaking out of a loop detaches that
iterator only; the atom stays resolved.

Atoms whose value is an async iterable get a managed consuming view through `scope.resolveStream(atom)`.
The scope drives the underlying iterator once and fans it out: each caller gets its own conflating view,
so concurrent consumers never steal elements from each other. Disposal and invalidation call
`iterator.return()`, so generator `finally` blocks and `ctx.cleanup` run; invalidation re-drives the newly
resolved iterable into the same views.

```ts
import { atom, createScope } from "@pumped-fn/lite"

const orders = atom({
  factory: async function* (ctx) {
    const sub = await connect("orders")
    ctx.cleanup(() => sub.close())
    yield* sub
  },
})

const scope = createScope()
for await (const order of scope.resolveStream(orders)) {
  await handle(order)
}
```

`scope.drain(atom, { take })` collects a fresh view into an array — until the producer completes, or after
`take` elements. Without `take` it only returns when the producer ends, so do not drain an infinite feed
unbounded. One producer-side caveat: `scope.dispose()` awaits `iterator.return()`, and JavaScript queues
that behind a pending `await` inside the generator, so a producer blocked on IO without yielding delays
disposal until that await settles.

Presets compose with all of it: `preset(orders, fakeFeed)` swaps the producer for a test, and
`await scope.drain(orders, { take: 3 })` asserts the consumed elements through the same seam.

## Presets And Tests

Presets replace atoms, flows, and resources at scope creation.

```ts
import { atom, createScope, preset } from "@pumped-fn/lite"

const clock = atom({
  factory: () => ({ now: () => Date.now() }),
})

const timestamp = atom({
  deps: { clock },
  factory: (_ctx, deps) => deps.clock.now(),
})

const scope = createScope({
  presets: [preset(clock, { now: () => 42 })],
})

const value = await scope.resolve(timestamp)
if (value !== 42) throw new Error("expected preset clock")

await scope.dispose()
```

This is the same seam production uses. The test changes the graph radius without module mocks, path-string
spies, or test-only branches.

## Extensions

Extensions wrap atom/resource resolution and flow/function execution. Use them for cross-cutting behavior
that should be complete and auditable: logging, metrics, auth checks, trace spans, transactions, and
runtime tag injection.

Extension hooks run around graph work, so they see the same seams as tests and composition roots.

## API Summary

| API | Purpose |
| --- | --- |
| `createScope(options?)` | Create a scope with optional `presets`, `tags`, `extensions`, and `gc` options |
| `atom(config)` | Define a scope-owned dependency or state node |
| `flow(config)` | Define execution work with optional `parse` or `typed<T>()` input |
| `resource(config)` | Define execution-context-owned state or lifecycle |
| `tag(config)` | Define typed ambient values and optional value equality |
| `tags.required/optional/all` | Request tags as dependencies |
| `preset(target, value)` | Replace an atom, flow, or resource in one scope |
| `controller(target, options?)` | Request an atom/resource controller dependency, or preconfigure flow-handle defaults |
| `scope.controller(atom)` | Observe and control atom state from the boundary |
| `scope.select(atom, selector, options?)` | Subscribe to a derived slice |
| `scope.changes(target, options?)` / `ctx.changes(...)` | Async-iterate atom values, select slices, or state transitions, conflated to latest |
| `scope.resolveStream(atom)` / `ctx.resolveStream(atom)` | Consume an async-iterable atom through a scope-driven fan-out view |
| `scope.drain(atom, options?)` | Collect an async-iterable atom into an array, optionally `take`-bounded |

Complete type reference: [`dist/index.d.mts`](./dist/index.d.mts)

Patterns and guardrails: [`PATTERNS.md`](./PATTERNS.md)

React integration: [`@pumped-fn/lite-react`](../../react/lite-react/README.md)

## License

MIT
