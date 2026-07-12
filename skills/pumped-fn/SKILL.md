---
name: pumped-fn
description: Build, change, test, or review production TypeScript using @pumped-fn/lite. Use for visible dependency graphs, atoms, flows, resources, tags and ports, controllers, extensions, scheduling, streaming, lifecycle, scope-seam tests, and pumped-lite-lint cleanup.
---

# Pumped-fn

Make every effect a graph edge. Roots/tests own the scope; one context is one honest action boundary.

## Route first

- Primitive choice, composition, tags, traps, extensions, scheduler: [design.md](references/design.md). Read before designing any graph.
- Scope-seam tests, lifecycle, review gates, complete garden composition: [delivery.md](references/delivery.md). Read before tests or final review.
- New workspace: copy `templates/workspace/`; create `src/`, `bin/`, `tests/` before first lint (the CLI crashes when a path is missing).

## Build loop

Install `@pumped-fn/lite` and dev dependency `@pumped-fn/lite-lint`. Add exactly:

```json
"lint": "pumped-lite-lint --max-warnings 0 src bin tests"
```

Write → `npm run lint` → fix every error and warning → repeat to zero → typecheck → test. Never waive a warning. The template supplies portable npm scripts and exact-pinned tool devDependencies.

## DON'T-first graph rules

- Don't put ambient IO (`fetch`, timers, filesystem, random) in feature factories. Put raw IO in a transport atom, capability above it, feature flow above that. `(lint catches this: no-ambient-io-outside-boundary, no-naked-globals)`
- Don't export helpers accepting scope/context or create a shared scope factory; roots/tests call `createScope` themselves. Export pure data functions. `(lint catches this: no-scope-argument, no-ctx-argument, no-scope-reach, no-shared-scope-factory)`
- Don't execute a child flow directly inside a flow. Declare `controller(child)` in deps and call its handle. `(lint catches this: no-direct-flow-composition)`
- Don't hide config in a handle factory closure. Declare a tag and consume `tags.required/optional/all`. `(lint catches the enclosing-parameter closure: config-via-tags)`
- Don't export a function that constructs/returns a handle. Export stable module-level handles. `(lint catches this: no-handle-factory)`
- Don't read tags through `ctx.data` without a declared dependency. `(lint catches this: no-implicit-tag-read)`
- Don't await a foreign client directly. Attribute it with named `ctx.exec({ fn, params, name })`. `(lint catches awaits rooted at a deps binding: no-unattributed-await)`
- Don't name handles `storeAtom`/`runFlow`, spread handles, keep mutable module state, use `deps.x`, throw bare builtins, swallow errors, mock modules, or add test branches. `(lint catches these respective shapes)`
- Don't inject a foreign capability as an atom: atoms construct scope-owned values; tags inject root/request/deployment values. `(review catches this)`
- Don't use `atom<Port>`, facade objects, wiring-only interfaces, comments, defensive trusted-path guards, or `any` as an escape. `(review catches this)`

## Implement

1. Draw `root/test → transport → capability → feature`, including contextual tags, resources, child controllers, and close owners.
2. Use [design.md](references/design.md) to choose each primitive and verify tag precedence/traps.
3. Parse untrusted input at the entry; use `typed<T>()` only for trusted internal input.
4. Put every replaceable edge in deps. Configure only through tags. Export stable handles.
5. Test only through `createScope({ presets, tags, extensions })` and public APIs; follow [delivery.md](references/delivery.md).
6. Run the build loop. Then diff every exported contract literally against the request: names, scalar/list shape, faults, yields, close results. A total/count is a number unless the contract explicitly says elements.

Adjacent React/Hono adapters exist; consult their installed declarations when needed. GC/flush, incremental adoption, and context parent-chain reads are valid but unexamined surfaces: verify declarations/tests before use.
