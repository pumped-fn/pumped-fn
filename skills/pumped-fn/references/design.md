# Design and traps

## Primitive decision

| Pick | When | Wrong pick fails as |
|---|---|---|
| `atom` | scope-cached constructed transport, capability, state, derived value; cleanup at scope disposal | module singleton loses preset/lifecycle seam; flow repeats state |
| `flow` | per-execution work/input; visible, traceable, presettable edge | plain helper hides effects; atom conflates calls |
| `resource` | context-owned tx/logger/buffer whose close outcome matters | atom leaks across actions |
| `tag` | injected config/request fact/role; not constructed | closure/global hides configuration |
| port | tag carrying a flow/interface when roots choose among implementations | conditionals/facades freeze implementation |
| `controller` | child flow handle; atom mutation/watch; resource resolve/watch/release | direct composition/manual subscriptions hide edges |
| extension | cross-cutting tracing/policy around graph edges | instrumentation contaminates business code |
| scheduler | recurring flow with explicit cadence/overlap/catch-up and backend | timers are ambient, untestable IO |

Generator flows yield progress and return a final result: `exec` drains; `execStream` exposes yields plus `.result`. `changes(atom)` is a conflated state view/wakeup; generator streams are pull-driven.

## Tags and ports

Flow tag precedence, highest first:

```text
exec-site → flow-declared → nearest context/ancestors → scope → tag default
```

`tags.required` fails lazily on first node resolution, not `createScope`; optional returns `undefined`. Atom tag deps see scope bindings/default only because atoms are scope-singletons. `tags.all` in atom deps collects every scope binding (flow-valued tags in atom deps throw); flow deps yield one value per context level — same-level bindings are shadowed, not collected and not deduped; fan out across levels or collect non-flow implementations via an atom. Binding an array of flows to a flow-valued tag is not multiplicity: it throws at execution.

Use a role port when implementations vary:

```ts
const deliver = tag<Lite.Flow<void, Notice>>({ label: "notice.deliver" })
const publish = flow({
  parse: typed<Notice>(),
  deps: { deliver: tags.required(deliver) },
  factory: (ctx, { deliver }) => deliver.exec({ input: ctx.input }),
})
```

For root-configured fan-out, collect non-flow implementations in an atom and keep policy optional:

```ts
const sink = tag<(notice: Notice) => Promise<void>>({ label: "notice.sink" })
const policy = tag<(notice: Notice) => boolean>({ label: "notice.policy" })
const sinks = atom({ deps: { all: tags.all(sink) }, factory: (_ctx, { all }) => all })
const publish = flow({
  parse: typed<Notice>(),
  deps: { sinks, policy: tags.optional(policy) },
  factory: (ctx, { sinks, policy }) => Promise.all(sinks.filter(() => policy?.(ctx.input) ?? true).map((send) => send(ctx.input))),
})
const scope = createScope({ tags: [sink(email), sink(sms)] })
const ctx = scope.createContext()
await ctx.exec({ flow: publish, input: notice })
expect(email).toHaveBeenCalledWith(notice)
expect(sms).toHaveBeenCalledWith(notice)
await scope.dispose()
```

## Exact traps

- `ctx.exec({ name, params, fn })` always requires `name`, `params`, and `fn`. Add `deps` only for graph dependencies. With `deps`, `fn(deps, ...params)` receives resolved graph dependencies first. Without it, `fn(...params)` receives execution inputs directly. Never close over call data: `ctx.exec({ name: "client.get", deps: { client }, params: [id], fn: ({ client }, input) => client.get(input) })`.
- Foreign calls fail as domain “no” and rejection. Convert both at the attributed exec site and declare the fault:

```ts
const charge = flow({
  name: "charge",
  parse: typed<Charge>(),
  faults: typed<{ code: "declined" | "unavailable"; id: string }>(),
  deps: { gateway },
  factory: async (ctx, { gateway }) => {
    try {
      const result = await ctx.exec({
        name: "gateway.charge",
        params: [gateway, ctx.input],
        fn: (target, input) => target.charge(input),
      })
      if (!result.ok) ctx.fail({ code: "declined", id: result.id })
      return result.receipt
    } catch (error) {
      if (isFault(charge, error) && error.fault.code === "declined") throw error
      return ctx.fail({ code: "unavailable", id: ctx.input.id })
    }
  },
})
```
- `isFault(flow, error)` matches the flow's **name**, not handle identity. Use both `isFault(theFlow, error)` and `error.fault.code`; a renamed controller can misclassify.
- `prepare()` only stages resolution. It is runtime-transparent: parse/deps/wrappers rerun for every `.exec()`. Keep one prepare site outside retry/fanout; await `.ready` only for readiness.
- `select` equality suppresses subscriber notification, not selector recomputation.
- `atom()` has no `name` option. Name its factory function when observability needs a name.
- `no-scope-argument` rejects exported scope-taking functions. Export pure functions; wire at roots.
- Module-level lookup objects can trip `no-module-state`; make a pure lookup function.
- `setTimeout` is ambient IO even under `bin/`; inject scheduling or use the scheduler. Composition filenames are `main|bootstrap|wire|adapter|composition|http|transport|server`; `bin/serve.ts` is not a root.
- Atom `watch` is valid only in atom deps; resource `watch` only in resource deps. Both require `resolve: true`; flow controllers do not watch.
- `ownership: "current"` means sibling-distinct, nested-shared. `"boundary"` shares across the boundary. Release is not context close.
- Put must-not-drop jobs in durable/state storage, then signal after commit. `changes(signal)` carries wakeups, not jobs. Multi-write invariants use one transaction.
- Parse wire data once at entry. Internal children use `typed<T>()`.
- Never signal shutdown with `process.exit`: a stop flow changes state/wakes loops; root awaits loops, then closes honestly.

## Resources and extensions

Tie commit/rollback to the close result:

```ts
const session = resource({
  name: "session",
  ownership: "current",
  factory: (ctx) => {
    const entries: string[] = []
    ctx.onClose(async (result) => result.ok ? commit(entries) : rollback(entries))
    return entries
  },
})
```

Watch placement is type-enforced (misplacement fails tsgo): `controller(upstreamResource, { resolve: true, watch: true })` belongs only in resource deps; atom watch belongs only in atom deps. To carry an atom value into a session resource, interpose a self-re-establishing resource that owns a `ctx.changes(atom)` subscription, cancels it with `ctx.cleanup`, and expose that bridge through a watched resource controller to the session. Retargeting then closes the old session and opens the replacement lazily on next use. Manually closing and reopening it inside a flow is the anti-pattern. Every session must also bind closure to scope disposal with `ctx.cleanup`, or to its execution outcome with `ctx.onClose`.

Extensions live at roots. Wrappers must call/return `next()`; register outcome work with `ctx.onClose`, or await `next()` before recording settled data. Foreign-edge parameters remain traceable only through `params`.

Install `@pumped-fn/lite-extension-scheduler` with `npm install --legacy-peer-deps` because its Lite peer is `^3.1.0` while Lite is `4.0.0`, then `import { scheduler } from "@pumped-fn/lite-extension-scheduler"`. `scheduler.schedule(...)` declares cadence, overlap, and catch-up and returns a keep-alive atom: resolve it at the root. The backend is a tag: `const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] }); const registration = await scope.resolve(job)`. In-process catch-up is only `"skip"`; durable `"last"`/`"all"` requires implementing `Scheduler.Backend`. Tests drive a manual backend. Teardown is `await registration.stop()` before `await scope.dispose()`.

A durable backend must register time as well as retain catch-up state; a backend that never calls `clock.every` runs only when manually triggered — production-dead.

```ts
const durable = (clock: Clock, store: Store): Scheduler.Backend => ({
  register(spec, tick) {
    store.save(spec.name, { cadence: spec.cadence, catchUp: spec.catchUp })
    const run = (scheduledAt: Date) => tick({ key: `${spec.name}:${scheduledAt.toISOString()}`, scheduledAt })
    const timer = clock.every(spec.cadence, run)
    return {
      trigger: (key) => tick({ key: key ?? `${spec.name}:manual`, scheduledAt: clock.now() }),
      next: () => timer.next(),
      stop: async () => timer.cancel(),
    }
  },
})
```

## Review-only correctness

- Signals follow successful durable writes; row + audit share one transaction.
- Conflated streams never own jobs; bound `scope.drain(feed, { take })`.
- Cross-cutting spans come from extensions, not feature factories.
- Request boundaries create a tagged context, store/pass it in framework state, execute, close; product code never reads AsyncLocalStorage.
- Contract fidelity is literal. Diff every export; totals/counts stay numeric.
