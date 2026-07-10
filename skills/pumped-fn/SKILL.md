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

## References

- Choosing/writing a primitive (atom, flow, resource, tag, controller) → [primitives.md](references/primitives.md)
- Writing or fixing a test → [testing.md](references/testing.md)
- Extensions, scheduler, request context → [extensions.md](references/extensions.md)
- Lint/typecheck/test loop, 24 exact lint mappings → [review.md](references/review.md)
- A full runnable composition (root + test) → [worked-example.md](references/worked-example.md)

## Workflow

Write the graph, then close the loop before calling anything done: run `pnpm lint`, fix every diagnostic including warnings, re-run until 0 (`pumped-lite-lint --max-warnings 0 src bin tests`), then `pnpm typecheck && pnpm test`. Below, `(lint catches this)` marks a machine-enforced rule — trust the loop, don't hand-audit for it. `(review catches this)` is human-only; see [review.md](references/review.md) for the preference table.

## Tag resolution order

A tag is injectable, passable config, not a constructed value. Lookup for `tags.required/optional/all` in a flow's deps walks, in order: exec-site tags (`ctx.exec({ tags: [...] })`) → the flow's own declared `tags` (fills only keys exec-site didn't set) → ancestor context tags, nearest first (`scope.createContext({ tags })`) → scope tags (`createScope({ tags })`, fills only what no context set) → the tag's own `default`. An atom's tag deps see only scope-level tags — atoms are scope-singletons, not context-scoped.

A required tag with no binding anywhere does **not** fail at `createScope()`. It fails lazily, the first time the node that declares it resolves: an atom throws `Tag "<label>" not found` during its own resolution; a flow throws the same during its deps resolution when executed. `tags.optional` returns `undefined`. Elaboration: [primitives.md](references/primitives.md).

## Non-negotiable shape

Read [primitives.md](references/primitives.md) for the primitive decision table before writing a factory.

- I-1: Don't call `fetch` `(lint catches this: no-ambient-io-outside-boundary, no-naked-globals)` or a DB driver `(review catches this)` directly inside a feature flow. Do: raw IO in a transport atom, then a capability atom, then the feature flow — `socket -> mailer -> sendDigest`; test with `preset(socket, fakeSocket)`, never a feature-level `fetch`.
- I-2: Don't write a product helper that accepts `scope` or `ctx`. `(lint catches this: no-scope-argument, no-ctx-argument, no-scope-reach)` Do: only a root/test creates scope/context — `bin: const ctx = scope.createContext()`; a helper accepts data.
- I-3: Don't call a child flow with `ctx.exec({ flow: child })` from inside another flow body. `(lint catches this: no-direct-flow-composition)` Do: declare it as a controller dep — `deps: { validate: controller(validate) }` then `validate.exec({ input })`; this permits `preset(validate, fake)`.
- I-4: Don't read a tag with `ctx.data.getTag`/`seekTag` inside a factory that never declared it. `(lint catches this: no-implicit-tag-read)` Do: declare ambient facts — `deps: { tenant: tags.required(tenant) }`; a missing binding fails at resolution (see Tag resolution order above), never an unchecked `undefined` read.
- I-5: Don't hardcode one delivery implementation inside a flow that has multiple real backends. Do: make a role tag a port — `const deliver = tag<Lite.Flow<void, Note>>()`; root supplies `deliver(emailDelivery)`, test supplies `deliver(collectingDelivery)`.
- I-6: Don't store the job payload in a signal you bump for wakeups — `signal.update(xs => [...xs, job])` where `changes(signal)` is the only reader. Do: persist must-not-drop work, then wake a drainer — `jobs.update(xs => [...xs, job]); signal.update(n => n + 1)`; `changes(signal)` is a wakeup, not the job queue.
- I-7: Don't signal before the write that makes the work durable has landed. Do: commit then signal — `await store.commit(job); signal.update(n => n + 1)`; a failed commit must leave no wakeup that advertises invisible work.
- I-8: Don't write a row and its audit event in two separate `db.transaction(...)` calls. Do: keep it in one — `await db.transaction(tx => tx.insert(task).insert(audit))`; retries may see both rows or neither.
- I-9: Don't parse wire input deep inside internal children. Do: parse at the entry — `parse: raw => CreateNote.parse(raw)`; an internal child uses `parse: typed<Note>()`.
- I-10: Don't let shutdown be an ad hoc `process.exit`. Do: choreograph it — `stop.exec()` flips `stopping`, bumps wakeups, root awaits loop promises, then closes the boundary with its real result.
- I-11: Don't manually `.subscribe()` a derived atom to a source atom. Do: use a controller dep watch — `controller(profile, { resolve: true, watch: true })`; mutate profile and assert the derived atom re-resolves.
- I-12: Don't `sleep`/timer-poll in a scheduled-flow test. Do: bind an explicit `overlap`/`catchUp`; production binds a durable backend, test binds a manual backend and drives ticks (see [extensions.md](references/extensions.md)).
- I-13: Don't suffix a definition handle with its kind (`queueAtom`, `deliverFlow`). `(lint catches this: no-definition-handle-suffix)` Do: name it by domain — `const queue = atom(...)`, `const deliver = flow(...)`.
- I-14: Don't add inline comments, defensive null guards, or catch-and-continue in trusted code. `(review catches this)` Do: fix the graph/type instead of casting to `any`; TSDoc only on public contracts.
- I-15: Don't thread `deps.store`/`deps.clock` through a factory body. `(lint catches this: prefer-destructured-deps)` Do: destructure at the edge — `factory: (ctx, { store, clock }) => ...`.
- I-16: Don't keep `let count = 0` at module scope inside a graph module. `(lint catches this: no-module-state)` Do: replace it with an atom — `const count = atom({ factory: () => 0 })` plus a controller.
- I-17: Don't `throw new Error(...)` or swallow a caught failure for a planned outcome. `(lint catches this: no-untyped-throw, no-swallowed-error)` Do: `faults: typed<{ kind: "quota"; userId: string }>()` and `ctx.fail({ kind: "quota", userId })`; at adapter/library boundaries only, throw a named error class with `kind/op/entity`.
- I-18: Don't spread a handle to bolt on tags (`{ ...shared, tags: [...] }`). `(lint catches this: no-handle-spread)` Do: make a thin entry flow with declared deps and execute the shared flow through `controller(shared)`.
- I-19: Don't write `atom<Port>(...)`, a facade object bundling flows behind methods, or a hand-written interface restating an inferable signature. `(review catches this)` Do: let graph inference work — `atom({ factory: ... })`, direct exported flows, `type Note` only at transfer boundaries.
- I-20: Don't reach for `vi.mock`, a global patch, or a test-only branch. `(lint catches this: no-module-mocks, no-test-only-branches)` Do: a test is exactly `createScope({ presets, tags, extensions })` plus public execution; if it needs a mock/reach/branch, make the dependency a graph edge.
- I-21: Don't add a test-only "product mode" to a flow. `(lint catches this: no-test-only-branches)` Do: preset a real-shaped edge — `preset(mailer, { send: async note => sent.push(note) })`; invoke the public flow and assert `sent`.
- I-22: Don't assert on elapsed time in a race test. `(review catches this)` Do: use gates — await `entered.wait`, assert intermediate state, call `release.open()`, await the same public promise.
- I-23: Don't close a context immediately in a catch without recording the failure. Do: close honestly — success `await ctx.close({ ok: true })`; a caught boundary failure `await ctx.close({ ok: false, error })`. Parent-owned resources follow parent close; a completed current-owned child is already settled.
- I-24: Don't fire-and-forget the promise a test executes. `(review catches this)` Do: store it once — `const run = ctx.exec({ flow: publish, input }); expectTypeOf(run)...; await run`.
- I-25: Don't emit cross-cutting spans from inside a business flow. `(review catches this)` Do: install extension objects at each root — `createScope({ extensions: [audit] })`; business flows name edges but don't self-instrument.
- I-26: Don't call a foreign SDK by closing over a local value inside `fn` — `ctx.exec({ fn: () => client.op(x), params: [] })` hides `x` from every extension. `(review catches this)` Do: flow it through `params` so `wrapExec`'s `ctx.input` records exactly what was called — `ctx.exec({ fn: (_ctx, x) => client.op(x), params: [x], name: "client.op" })`. `fn` receives `(ctx, ...params)`; a closed-over value stays invisible to tracing.
- I-27: Don't write an extension that never calls `next()`, or that records before the continuation settles. `(review catches this)` Do: execute continuations — `wrapExec: async (next, target, ctx) => { ctx.onClose(record); return next() }`; `wrapResolve: async next => next()`.
- I-28: Don't read `AsyncLocalStorage` from product code. `(review catches this)` Do: boundary code creates a request context with request tags, stores/passes it in framework-owned request state, executes the public flow, closes it; product code only declares tags.
- I-29: Don't run schema parsing again on an already-trusted internal handoff. `(review catches this)` Do: `typed<T>()` is the zero-parser trusted path; only the boundary runs schema parsing.
- I-30: Don't call `child.prepare(...)` inside a retry loop. `(review catches this)` Do: one staging site — `const retry = child.prepare({ key: job.id, input: job })`; await `retry.ready` if needed, then `await retry.exec()` per deliberate retry/fanout.
- I-31: Don't treat `changes(signal)` as the job queue, or drain a generator without pulling. Do: `changes(signal)` may conflate 1→3 into one wakeup, so drain state; `for await (const item of ctx.execStream({ flow: scan }))` requests the next item only after consuming one.
- I-32: Don't declare a wake/signal atom without `keepAlive` with no live subscriber, or assert pending work without flushing. Do: `atom({ keepAlive: true, factory: () => 0 })`; `await scope.drain(feed, { take: 10 })` is bounded; `await scope.flush()` before asserting pending work is finished.

## Ownership, lifecycle, and primitives

Use `atom` for scope-lived state/capability, `flow` for per-action work, `resource` for context-owned values, `tag` for contextual facts/roles, `controller` for child flows or intentional state control, and extensions for cross-cutting policy. Decide by where the value comes FROM: an atom's factory CONSTRUCTS its value inside the graph; a value SUPPLIED from outside (composition root, deployment, request) is a tag — an injected foreign client/capability is always a tag (or port flow), never an atom. Full table: [primitives.md](references/primitives.md).

## Execution and testing

Foreign execution always supplies `params`, including zero arguments: `await ctx.exec({ fn: () => client.ping(), params: [], name: "client.ping" })`. Flow execution instead uses `ctx.exec({ flow, input })`. Consume a generator stream before awaiting `.result`; breaking it is an aborted close. Roots/tests own setup and teardown: one promise executed once, asserted, context closed honestly, scope disposed. Deterministic races, recovery, and shutdown patterns: [testing.md](references/testing.md).

## Trap corpus

- Injected client as atom: if the composition root hands you the implementation, wrapping it in an atom hides the injection point — declare a `tag<ClientType>()` and bind it at the root; deps take `tags.required(client)`.
- Fn edges require `params` even at arity zero: `ctx.exec({ fn: ping, params: [], name: "client.ping" })`; omitting it throws `params is not iterable`.
- A foreign edge fails two ways: a domain "no" in its return AND a rejected promise. Catch at the exec site and convert both into the flow's declared fault carrying the domain id: `try { await ctx.exec({ fn: () => ops.dispatch(id), params: [], name: "ops.dispatch" }) } catch (error) { return ctx.fail({ code: "dispatch-failed", id, message: String(error) }) }`. A rejection that escapes raw loses the id and is untyped to callers.
- Retry only a declared flow's fault: `if (isFault(transcribeEpisode, error) && error.fault.code === "busy")`. The test is `error.flow === flow.name`; a deps handle or `controller(child, { name })` rename misclassifies it.
- `prepare()` captures options once, but each `step.exec()` parses, resolves deps, and runs wrappers again. Keep one staging site outside the retry loop; no runtime signal proves it was staged once.
- `tags.all(port)` on an atom collects every scope binding; on a flow it yields one value per context level. Put multi-binding fan-out in a registry atom. Do not bind an array of flows: projection does not recurse and execution throws.
- For a resolved atom controller, `set(value)` and `update(() => value)` behave alike. Prefer `ctrl.set(wholeValue)` when replacing all state; that is readability, not stronger semantics.
- Export pure functions. Inline `scope.select`/`scope.exec` at a root: exported scope-taking functions are flagged even in composition files. The filename allowlist is exact: `main`, `bootstrap`, `wire`, `adapter`, `composition`, `http`, `transport`, or `server`; `bin/monitor.ts` is not a root.
- Keep lookup tables inside a factory function, not module scope: closed-over module containers trigger `no-module-state`. Wrap awaited port methods in named fn edges; `setTimeout` remains ambient IO, including `bin/`.
- Flows/resources accept `name`; `atom()` does not. For resolve observability, name a resource and use a named factory function expression for an atom. In `wrapExec`, use `ctx.name` and `ctx.parent?.name`; record after `await next()` for completion order.
- Watch an upstream resource from resource deps. Atom watch belongs in atom deps and is runtime-enforced. Bridge atom state to a resource with an owner-bound subscription that releases/re-resolves itself; dependent re-establishment is lazy on the next use.

## Setup and review loop

Copy `templates/workspace/` (config only: package.json, tsconfig.json, vitest.config.ts), then create `src/`, `bin/`, `tests/` before the first lint run — `pumped-lite-lint` `stat()`s each configured path and crashes uncaught on a missing one; it does not treat missing as zero files. `"lint": "pumped-lite-lint --max-warnings 0 src bin tests"` is already wired; `--max-warnings 0` is mandatory since warn-tier rules count. Before the final gate, diff each export's return against its prescribed shape - a total is a count, not a list. Then `pnpm lint && pnpm typecheck && pnpm test`. [review.md](references/review.md) has the 24 lint mappings and preference table; [worked-example.md](references/worked-example.md) is a runnable composition.
