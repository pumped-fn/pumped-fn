# @pumped-fn/lite

**Scoped Ambient State** for TypeScript — a scope-local atom graph with explicit dependencies and opt-in reactivity.

State lives in the scope, not in the component tree. Handlers and components observe — they don't own or construct dependencies. The same graph works across React, server handlers, background jobs, and tests.

**Frontend** — atoms form a reactive dependency graph (`homeData <- auth`). UI subscribes via controllers; auth changes cascade to dependents automatically. Components are projections of state, not owners.

**Backend** — atoms are infrastructure singletons (db pool, cache). Runtime config enters the scope as tags; atoms consume it via `tags.required()`. Contexts bound per request carry tags (tenantId, traceId) without parameter drilling. Extensions wrap every resolve/exec for logging, tracing, auth. Cleanup is guaranteed.

**Both** — presets swap any atom/flow for testing or multi-tenant isolation. Tags carry runtime config; presets replace implementations. No module mocks, no global patches above raw transport wrappers, no test-only product branches.

```
npx @pumped-fn/lite              # CLI reference
npx @pumped-fn/lite primitives   # API
npx @pumped-fn/lite diagrams     # mermaid source
```

## Boundary Ownership

Scope is the composition and test seam. Composition roots, tests, and other boundary adapters call `createScope({ presets, tags, extensions })`; product code enters the graph through declared atoms, flows, resources, tags, controllers, and execution APIs.

`scope` is not a product helper argument. A helper that accepts scope to fetch dependencies is acting like a service locator. Make it a graph node, call it from a graph node as a pure helper, or execute the target through flows, `ctx.exec`, resources, or providers.

Presets choose test radius. Inside-out tests preset a unit's direct dependencies; outside-in tests preset only edge adapters. A test that needs module mocks, internal reaches, global patches above raw transport wrappers, or test-only product branches means the design leaked past the scope seam.

Raw ambient IO belongs in transport atoms or composition-root adapters. Capability atoms depend on transports and expose domain/application capabilities. Feature atoms depend on capabilities, not raw transports plus auth/session/token plumbing.

Composition roots are thin, tested adapters. They own scope creation, root execution context creation or receipt, provider or route mounting, and disposal. They should not grow facade objects that bundle business flows or shared preconfigured scope factories.

Public examples with strong architectural claims should include structural guards. Counts, coverage, inventories, and implemented-slice claims should be derived or explicitly scoped so docs cannot drift ahead of the code.

## Execution-Scoped Resources

Use `resource()` for values that belong to one `ExecutionContext`: request loggers, transactions, trace spans, per-request clients. The value is cached on the context that owns the miss, can be read by child executions through upward lookup, and is reset with `ctx.release(resource)` or `ctx.close()`.

Resource `ownership` controls which execution context owns a miss. `ownership: "boundary"` is the default: a child execution reuses the nearest boundary-owned value or creates the value on that boundary. Use it for per-request clients and loggers shared by work inside the same request boundary. `ownership: "current"` creates the value on the current execution boundary; `ctx.exec()` children can reuse it, while sibling executions and nested explicit context boundaries get their own instance. Use it for transactions, trace spans, or action-scoped state.

```ts
import { createScope, resource } from "@pumped-fn/lite"

const auditLogger = resource({
  name: "audit-logger",
  ownership: "boundary",
  factory: (ctx) => {
    const lines: string[] = []
    ctx.cleanup(() => {
      lines.length = 0
    })
    return {
      log(line: string) {
        lines.push(line)
      },
      snapshot: () => [...lines],
    }
  },
})

const tx = resource({
  name: "tx",
  ownership: "current",
  factory: (ctx) => {
    const tx = {
      commit() {},
      rollback() {},
      release() {},
    }
    ctx.onClose((result) => result.ok ? tx.commit() : tx.rollback())
    ctx.cleanup(() => tx.release())
    return tx
  },
})

const scope = createScope()
const ctx = scope.createContext()

const audit = await ctx.resolve(auditLogger)
audit.log("request started")

await ctx.release(auditLogger) // owner-local reset
await ctx.close()
await scope.dispose()
```

Resource factories receive a `ResourceContext`: all normal execution-context APIs plus `ctx.cleanup(fn)` for resource-local cleanup. Use `ctx.onClose(result => ...)` for execution-boundary commit/rollback decisions, and `ctx.cleanup(fn)` for releasing the resource itself.

Resource controllers are execution-context handles:

```ts
import { controller, resource } from "@pumped-fn/lite"

const config = resource({ factory: () => ({ version: 1 }) })

const client = resource({
  deps: {
    config: controller(config, {
      resolve: true,
      watch: true,
      eq: (a, b) => a.version === b.version,
    }),
  },
  factory: (_ctx, { config }) => {
    const cfg = config.get()
    return { version: cfg.version }
  },
})
```

`watch: true` for resource controllers is valid only inside resource deps. It listens for resolved value changes and releases the dependent resource lazily. Atom deps cannot depend on resources, and flow deps cannot use watched resource controllers.

## Tags And Extensions

Use tags for primitive metadata, context config, and typed injection contracts. Use extensions for scope behavior that wraps resolve/exec. Extensions can set typed runtime tags before dependencies resolve; flows then request those contracts with `tags.required()`.

```ts
import { createScope, flow, tag, tags } from "@pumped-fn/lite"

const runId = tag<string>({ label: "run.id" })

const run = flow({
  deps: { runId: tags.required(runId) },
  factory: (_ctx, deps) => ({ runId: deps.runId }),
})

const scope = createScope()
const ctx = scope.createContext({ tags: [runId("run-1")] })
await ctx.exec({ flow: run })
await ctx.close()
await scope.dispose()
```

## How It Works

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ext as Extension
    participant Atom
    participant Ctx as ExecutionContext
    participant Child as ChildContext
    participant Flow
    participant Ctrl as Controller

    Note over App,Ctrl: (*) stable ref — same identity until released

    %% ── Scope Creation & Extension Init ──
    App->>Scope: createScope({ extensions, presets, tags, gc })
    Scope-->>App: scope (sync return)

    loop each extension (sequential)
        Scope->>Ext: await ext.init(scope)
    end
    Note right of Scope: all init() done → scope.ready resolves
    Note right of Scope: any init() throws → scope.ready rejects
    Note right of Scope: resolve() auto‑awaits scope.ready

    %% ── Observers (register before or after resolve) ──
    App->>Scope: scope.on('resolving' | 'resolved' | 'failed', atom, listener)
    Scope-->>App: unsubscribe fn
    Note right of Scope: scope.on listens to AtomState transitions

    %% ── Atom Resolution ──
    Note right of Scope: singletons — created once, reused across contexts. deps can include tags.required()
    App->>Scope: resolve(atom)
    Scope->>Scope: cache hit? → return cached
    alt preset hit
        Scope->>Scope: value → store directly, skip factory
        Scope->>Scope: atom → resolve that atom instead
        Scope->>Scope: ⚡ emit 'resolved' (no 'resolving')
    end
    Scope->>Scope: state → resolving
    Scope->>Scope: ⚡ emit 'resolving' → scope.on listeners
    Scope->>Ext: wrapResolve(next, { kind: "atom", target, scope })
    Ext->>Atom: next() → factory(ctx, deps)
    Note right of Atom: ctx.cleanup(fn) → stored per atom
    Note right of Atom: cleanups run LIFO on release/invalidate
    Atom-->>Ext: value
    Note right of Ext: ext returns value — may transform or replace
    alt factory succeeds
        Ext-->>Scope: value (*) cached in entry
        Scope->>Scope: state → resolved
        Scope->>Scope: ⚡ emit 'resolved' → scope.on + ctrl.on listeners
    else factory throws
        Atom-->>Scope: error
        Scope->>Scope: state → failed
        Scope->>Scope: ⚡ emit 'failed' → scope.on listeners (ctrl.on '*' only)
    end

    %% ── Context Creation ──
    Note right of Scope: HTTP request, job, transaction — groups exec calls with shared tags + guaranteed cleanup
    App->>Scope: scope.createContext({ tags })
    Scope-->>App: ctx

    %% ── Execution ──
    alt ctx.exec({ flow, input, tags })
        Ctx->>Ctx: preset? → flow: re‑exec with replacement / fn: runs with ctx only (deps NOT resolved)
        Ctx->>Ctx: flow.parse(input) if defined
        Ctx->>Child: create child (parent = ctx, merged tags)
        Note right of Child: Tags are visible before deps; extensions wrap exec
        Child->>Ext: wrapExec(next, flow, childCtx)
        Ext->>Flow: next() → resolve deps + factory(childCtx, deps)
        Note right of Flow: childCtx.onClose(result: CloseResult) → { ok: true } | { ok: false, error }
        Flow-->>Ext: output
        Note right of Ext: ext returns output — may transform or replace
        Ext-->>Child: output
    else ctx.exec({ name?, fn, params, tags })
        Ctx->>Child: create child (parent = ctx)
        Child->>Ext: wrapExec(next, fn, childCtx)
        Ext->>Child: next() → fn(childCtx, ...params)
        Child-->>Ext: result
    end
    Ctx->>Child: [A] close(result) → run onClose(CloseResult) LIFO
    Child-->>Ctx: output
    Ctx-->>App: output

    %% ── Resource (execution‑scoped) ──
    rect rgb(245, 240, 255)
        Note over App,Ctrl: Resource (per‑execution middleware)
        Note right of Scope: reusable factory resolved by execution-context ownership — logger, transaction, trace span

        App->>App: resource({ deps, factory, ownership? })
        App-->>App: Resource definition (inert)

        Note right of Child: during dep resolution in ctx.exec():
        Note right of Child: seek hierarchy for existing instance
        alt cache hit (seek‑up)
            Child->>Child: reuse instance from parent ✓
        else cache miss
            Child->>Ext: wrapResolve(next, { kind: "resource", target, ctx })
            Ext->>Child: next() → factory(ownerCtx, deps)
            Note right of Child: ownerCtx chosen by boundary/current ownership
            Child-->>Ext: instance stored on owner context
        end
    end

    %% ── Reactivity (opt‑in) ──
    rect rgb(240, 248, 255)
        Note over App,Ctrl: Reactivity (opt‑in — atoms are static by default)
        Note right of Scope: live config, UI state, cache invalidation — when values change after initial resolve
        App->>Scope: controller(atom)
        Scope-->>Ctrl: ctrl (*)

        App->>Ctrl: ctrl.on('resolving' | 'resolved' | '*', listener)
        Ctrl-->>App: unsubscribe
        Note right of Ctrl: ctrl.on listens to per‑atom entry events

        App->>Ctrl: ctrl.set(v) / ctrl.update(fn)
        Ctrl->>Scope: scheduleInvalidation(set)
        Note right of Scope: apply value (skip factory, cleanups NOT run)
        Scope->>Scope: state → resolved
        Scope->>Scope: ⚡ emit 'resolved' → scope.on + ctrl.on

        App->>Ctrl: ctrl.invalidate()
        Ctrl->>Scope: scheduleInvalidation
        Scope->>Scope: run atom cleanups (LIFO)
        Scope->>Scope: ⚡ emit 'resolving' → scope.on + ctrl.on
        Scope->>Atom: re‑run factory
        Scope->>Scope: state → resolved
        Scope->>Scope: ⚡ emit 'resolved' → scope.on + ctrl.on

        App->>Scope: select(atom, selector, { eq })
        Scope-->>App: handle { get, subscribe }

        Note over App,Ctrl: Dependency reactivity — atom deps only
        Note right of Scope: watch:true replaces manual ctx.cleanup(ctx.scope.on('resolved', dep, () => ctx.invalidate()))
        App->>Scope: resolve(derived)
        Note right of Scope: deps: { src: controller(src, { resolve: true, watch: true, eq? }) }
        Scope->>Scope: on dep 'resolved': eq(prev, next) → scheduleInvalidation if changed
        Note right of Scope: watch listener auto-cleaned on re-resolve / release / dispose
    end

    %% ── Cleanup & Teardown ──
    rect rgb(255, 245, 238)
        Note over App,Scope: Teardown
        App->>Ctx: ctx.close(result?) — same as [A]
        Ctx->>Ctx: run onClose(CloseResult) cleanups (LIFO, idempotent)

        App->>Scope: release(atom)
        Scope->>Scope: run atom cleanups (LIFO)
        Scope->>Scope: remove from cache + controllers

        App->>Scope: flush()
        Note right of Scope: await pending invalidation chain

        App->>Scope: dispose()
        loop each extension
            Scope->>Ext: ext.dispose(scope)
        end
        Scope->>Scope: release all atoms, run all cleanups
    end

```

API reference: `dist/index.d.mts` | Patterns: `PATTERNS.md` | CLI: `npx @pumped-fn/lite`

## License

MIT
