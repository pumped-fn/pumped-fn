---
name: pumped-fn
description: Load when writing or reviewing TypeScript with @pumped-fn/lite: build visible graphs, own contexts and resources, test through scopes, and review lifecycle, streaming, observability, and performance.
---

# Pumped-fn

Build a visible graph. A scope is the one substitution seam; a context is one honest action boundary.

```text
root/test -> createScope({ presets, tags, extensions })
                 -> transport atom -> capability -> feature flow
                 -> context -> current/boundary resources -> close result
```

## Non-negotiable shape

- I-1: Put raw IO in a transport atom, then expose a capability atom, then feature flow: `socket -> mailer -> sendDigest`; test with `preset(socket, fakeSocket)`, never a feature-level `fetch`.
- I-2: Only a root/test creates scope/context: `bin: const ctx = scope.createContext()`; a product helper accepts data, not `scope` or `ctx`.
- I-3: A child is a declared controller dep: `deps: { validate: controller(validate) }` then `validate.exec({ input })`; this permits `preset(validate, fake)`.
- I-4: Declare ambient facts: `deps: { tenant: tags.required(tenant) }`; a missing binding must fail at resolution, never become an unchecked `undefined` read.
- I-5: A role tag is a port: `const deliver = tag<Lite.Flow<void, Note>>()`; root supplies `deliver(emailDelivery)`, test supplies `deliver(collectingDelivery)`.
- I-6: Persist must-not-drop work, then wake a drainer: `jobs.update(xs => [...xs, job]); signal.update(n => n + 1)`; `changes(signal)` is a wakeup, not the job queue.
- I-7: Commit then signal: `await store.commit(job); signal.update(n => n + 1)`; a failed commit must leave no wakeup that advertises invisible work.
- I-8: Keep one aggregate invariant in one transaction: `await db.transaction(tx => tx.insert(task).insert(audit))`; retries may see both rows or neither.
- I-9: Parse wire input at its entry: `parse: raw => CreateNote.parse(raw)`; an internal child uses `parse: typed<Note>()`.
- I-10: Shutdown is choreography: `stop.exec()` flips `stopping`, bumps wakeups, root awaits loop promises, then closes the boundary with its real result.
- I-11: A derived atom watches an atom dep: `controller(profile, { resolve: true, watch: true })`; mutate profile and assert the derived atom is re-resolved, not manually subscribed.
- I-12: Schedule a flow with explicit `overlap` and `catchUp`; production binds a backend tag, test triggers a manual backend once—never sleep for a timer.
- I-13: Definition names carry domain only: `const queue = atom(...)`, `const deliver = flow(...)`; reject `queueAtom` and `deliverFlow`.
- I-14: Trusted code is direct: no inline comments, defensive null guards, or catch-and-continue; TSDoc only on public contracts. Fix the graph/type instead of casting to `any`.
- I-15: Destructure dependencies at the edge: `factory: (ctx, { store, clock }) => ...`, not `deps.store` throughout.
- I-16: Replace module mutable state with an atom: not `let count = 0`; use `const count = atom({ factory: () => 0 })` plus a controller.
- I-17: Planned flow failure is structured data: `faults: typed<{ kind: "quota"; userId: string }>()` and `ctx.fail({ kind: "quota", userId })`. At adapter/library boundaries only, throw a named error class with `kind/op/entity`; never bare `Error`, and never swallow either form.
- I-18: Do not spread handles to alter tags. Make a thin entry flow with declared deps and execute the shared flow through `controller(shared)`.
- I-19: Let graph inference work: `atom({ factory: ... })`, direct exported flows, and `type Note` only at transfer boundaries; no facade object, `atom<Port>`, or local wiring interface.
- I-20: A test has exactly `createScope({ presets, tags, extensions })` plus public execution. If it needs a mock/import reach/test branch, make the dependency a graph edge.
- I-21: Preset a real-shaped edge: `preset(mailer, { send: async note => sent.push(note) })`; invoke the public flow and assert `sent`, not a test product mode.
- I-22: Race tests use gates: await `entered.wait`, assert intermediate state, call `release.open()`, await the same public promise. No elapsed-time assertion.
- I-23: Close honestly: after success `await ctx.close({ ok: true })`; after a caught boundary failure `await ctx.close({ ok: false, error })`. Parent-owned resources follow parent close; a completed current-owned child is already settled.
- I-24: Type-check the promise you execute once: `const run = ctx.exec({ flow: publish, input }); expectTypeOf(run)...; await run`.
- I-25: Install extension objects at each root: `createScope({ extensions: [audit] })`; business flows name edges but do not emit their own cross-cutting spans.
- I-26: Every foreign call is named and tagged when useful: `ctx.exec({ fn: (_ctx, note) => client.send(note), params: [note], name: "mail.send", tags: [step({ workflow: true, kind: "delivery" })] })`; inspect extension records by workflow/run id.
- I-27: Extension wrappers execute continuations: `wrapExec: async (next, target, ctx) => { ctx.onClose(record); return next() }`; `wrapResolve: async next => next()`.
- I-28: Boundary code creates a request context with request tags, stores/passes it in framework-owned request state, executes public flow, and closes it. Product code declares tags; it never reads ALS.
- I-29: `typed<T>()` is the trusted, zero-parser path; prove a child receives a typed `Note` while only the boundary runs schema parsing.
- I-30: `const retry = child.prepare({ key: job.id, input: job })`; await `retry.ready` when staging is needed, then `await retry.exec()` for each deliberate retry/fanout. Binding alone does no run.
- I-31: `changes(signal)` may conflate 1→3 into one wakeup, so drain state. A generator is pull-driven: `for await (const item of ctx.execStream({ flow: scan }))` requests the next item only after consuming one.
- I-32: Keep a required wake signal alive: `atom({ keepAlive: true, factory: () => 0 })`; `await scope.drain(feed, { take: 10 })` is bounded. Configure GC deliberately and `await scope.flush()` before asserting pending graph work is finished.

## Ownership, lifecycle, and primitives

Use `atom` for scope-lived state/capability, `flow` for per-action work, `resource` for context-owned values, `tag` for contextual facts/roles, `controller` for child flows or intentional state control, and extensions for cross-cutting policy.

`resource({ ownership: "current" })` is private to a top-level action and shared by its nested executions. `ownership: "boundary"` is shared by a boundary and descendants. Register transactional outcome behavior in the resource factory: `ctx.onClose(result => result.ok ? tx.commit() : tx.rollback())`; `ctx.release(resource)` releases the owner-local value but does not replace an honest later close result.

Use `scope.select(atom, selector, { eq })`, never a top-level `select` import. `eq` suppresses subscriber notification, not selector recomputation. Atom controllers may `set`/`update`; resource controllers only resolve/release/observe. Put atom `watch: true` only in atom deps and resource `watch: true` only in resource deps.

For tags, `tags.optional(port)` returns undefined and `tags.all(port)` returns all role bindings. `tag({ eq })` controls value equality; `tag.same(a, b)` compares tagged entries. `ctx.data.seekTag(tag)` searches a parent chain and `getTag(tag)` is local-only; product factories should prefer declared `tags.required/optional/all`. A service-pattern atom may use a named `ctx.exec({ fn, params, name })` for one adapter call, not an ambient client.

GC/flush are reference details: `createScope({ gc: { enabled: true, graceMs: 3000 } })` sets collection policy; `scope.flush()` awaits pending operations. Adjacent surfaces exist: `@pumped-fn/lite-react`, `@pumped-fn/lite-hono` (out of v1). For incremental adoption, wrap one legacy leaf in a transport atom, expose a capability, preset it in its first seam test, then migrate callers one boundary at a time.

## Execution and testing

Foreign execution always supplies `params`, including zero arguments: `await ctx.exec({ fn: () => client.ping(), params: [], name: "client.ping" })`. Flow execution instead uses `ctx.exec({ flow, input })`. Consume a generator stream before awaiting `.result`; breaking it is an aborted close.

Roots/tests own setup and teardown. A test executes one promise once, asserts its result and observable fake calls, closes the context, then disposes the scope. Use a shared durable fake across two scopes for recovery tests. For a resource transaction, put awaited commit and its subsequent signal in the same successful `onClose` callback; inline store transactions are a separate commit-then-signal pattern.

## Review and references

Run the project loop: `pnpm lint && pnpm typecheck && pnpm test`. Read [review.md](references/review.md) for the 24 exact lint mappings and preference review; [primitives.md](references/primitives.md), [testing.md](references/testing.md), and [extensions.md](references/extensions.md) for elaboration; [worked-example.md](references/worked-example.md) for a runnable composition.
