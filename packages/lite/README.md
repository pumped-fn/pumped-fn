# @pumped-fn/lite

**Scoped Ambient State** for TypeScript — a scope-local atom graph with explicit dependencies and opt-in reactivity.

State lives in the scope, not in the component tree. Handlers and components observe — they don't own or construct dependencies. The same graph works across React, server handlers, background jobs, and tests.

**Frontend** — atoms form a reactive dependency graph (`homeData <- auth`). UI subscribes via controllers; auth changes cascade to dependents automatically. Components are projections of state, not owners.

**Backend** — atoms are infrastructure singletons (db pool, cache). Runtime config enters the scope as tags; atoms consume it via `tags.required()`. Contexts bound per request carry tags (tenantId, traceId) without parameter drilling. Extensions wrap every resolve/exec for logging, tracing, auth. Cleanup is guaranteed.

**Both** — presets swap any atom/flow for testing or multi-tenant isolation. Tags carry runtime config; presets replace implementations. No mocks, no test-only code paths.

```
npx @pumped-fn/lite              # CLI reference
npx @pumped-fn/lite primitives   # API
npx @pumped-fn/lite diagrams     # mermaid source
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
    Scope->>Ext: wrapResolve(next, atom, scope)
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
        Ctx->>Ctx: preset? → flow: re‑exec with replacement / fn: run as factory
        Ctx->>Ctx: flow.parse(input) if defined
        Ctx->>Child: create child (parent = ctx, merged tags)
        Child->>Ext: wrapExec(next, flow, childCtx)
        Ext->>Flow: next() → factory(childCtx, deps)
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
        Ctrl->>Scope: scheduleInvalidation
        Scope->>Scope: run atom cleanups (LIFO)
        Scope->>Scope: ⚡ emit 'resolving' → scope.on + ctrl.on
        Scope->>Atom: apply new value (skip factory)
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
