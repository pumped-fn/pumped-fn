---
name: pumped-fn
description: Load when writing or reviewing TypeScript that uses @pumped-fn/lite: choose graph primitives, compose scopes and execution contexts, test through presets/tags/extensions, and judge lifecycle, observability, streaming, and performance.
---

# Pumped-fn

Build a visible graph, not a DI container plus helpers.

```text
root/test -> createScope({ presets, tags, extensions })
                 -> atoms: long-lived transports, capabilities, state
                 -> context: one request/job/action boundary
                 -> flows/resources: short-lived work and owned values
```

One scope materializes one substitutable graph. Every effect is either a declared graph edge or a named `ctx.exec({ fn })` foreign edge. The scope seam is the only test seam: no module mocks, globals, scope-taking helpers, or hidden composition.

## Pick the primitive

| Pick | When | Wrong choice fails by |
|---|---|---|
| `atom` | Scope-lived transport, capability, state, cache, or derived value | Recreating state/work per flow call or hiding an ambient singleton |
| `flow` | Per-invocation domain work with input, effects, trace, or substitution | Plain helper becomes an invisible, unpresettable edge |
| `resource` | Value owned by an execution context: tx, logger, draft, buffer | Atom leaks it between requests or lifecycle is detached |
| `tag` | Contextual/configured fact or role selection | Ambient reads and parameter drilling hide the dependency |
| port flow | A root/test chooses one capability implementation | Env-switch/facade binds implementation outside the seam |
| `controller(atom)` | Intentional atom mutation, observation, or derived invalidation | Manual subscriptions obscure cleanup/invalidation |
| `controller(flow)` | A child flow inside a flow/resource | `ctx.exec({ flow })` hides the graph edge |
| extension | Cross-cutting logging, tracing, auth, policy | Calls scattered through business factories |
| scheduler | Recurring flow with explicit overlap/catch-up policy | Timer in a factory is untestable ambient work |

## Hard walls

- Roots and tests alone call `createScope`/`createContext`; each use site owns its setup.
- Keep transport -> capability -> feature. Wrap raw IO in a transport atom.
- Declare tags in `deps`; use `tags.required`, `optional`, or `all`, never undeclared `ctx.data` reads.
- Compose child flows as `deps: { child: controller(child) }`; never `ctx.exec({ flow: child })` in a flow body.
- Use `parse:` at untrusted boundaries and `typed<T>()` for trusted internal inputs. A no-input flow says `parse: typed<void>()`.
- Declare planned faults with `faults: typed<Fault>()` and call `ctx.fail(fault)`; do not `throw new Error` in a factory.
- Resource commit/rollback belongs in its factory's `ctx.onClose(result => ...)`, bound to the close result.
- Atom-watch belongs only in atom deps; resource-watch belongs only in resource deps. `select(..., { eq })` suppresses notification, not selector recomputation.
- Work that must not drop lives in state. Streams/`changes` are conflated wakeups or views, not queues. Signal only after commit.
- No definition-handle suffixes, facade objects, ceremony generics, module state, inline comments, swallowed errors, or `any` except stored variance/type-erasure slots.

## Workflow

1. Draw the boundary, graph nodes, tags, foreign calls, ownership, and test substitutions.
2. Write nodes with explicit `deps`; add root extensions and named foreign calls.
3. Test only through `createScope({ presets, tags, extensions })` and public flows.
4. Run the project loop until clean: `pnpm lint && pnpm typecheck && pnpm test`. A fresh workspace lint shape is `node /path/to/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests`.

Read the needed reference before coding:

- [primitives.md](references/primitives.md): exact shapes and lifecycle semantics.
- [testing.md](references/testing.md): seam tests, gates, recovery.
- [extensions.md](references/extensions.md): observability, scheduler, request context.
- [review.md](references/review.md): full design-trace rubric and all lint rules.
- [worked-example.md](references/worked-example.md): complete garden-controller composition.

The large composition is `examples/invoice-triage/`; study its graph mechanics, not its business story.
