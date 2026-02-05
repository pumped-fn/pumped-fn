# @pumped-fn/lite

Lightweight effect system for TypeScript: scoped lifecycles, tagged context, and opt‑in reactivity.

Docs: `packages/lite/PATTERNS.md` for usage patterns, `packages/lite/dist/index.d.mts` for API details.

## How It Works

```mermaid
sequenceDiagram
    participant App
    participant Scope
    participant Ext as Extension
    participant Ctx as ExecutionContext
    participant Atom
    participant Flow
    participant Ctrl as Controller

    App->>Scope: createScope({ extensions, presets, tags })
    Scope-->>App: scope (ready)

    App->>Scope: resolve(atom)
    Scope->>Ext: wrapResolve(next, atom)
    Ext->>Atom: factory(ctx, deps)
    Atom-->>Scope: value (cached)

    App->>Scope: createContext({ tags })
    Scope-->>App: ctx

    App->>Ctx: ctx.exec({ flow, input, tags })
    Ctx->>Ctx: merge tags, create childCtx
    Ctx->>Ext: wrapExec(next, flow, childCtx)
    Ext->>Flow: parse(input) + factory(childCtx, deps)
    Flow-->>Ext: output
    Ext-->>Ctx: output
    Ctx->>Ctx: childCtx.close() (onClose LIFO)
    Ctx-->>App: output

    rect rgb(240, 248, 255)
        Note over App,Ctrl: Reactivity (opt‑in)
        App->>Scope: controller(atom)
        Scope-->>Ctrl: ctrl
        App->>Ctrl: ctrl.get() / ctrl.resolve()
        Ctrl-->>App: value
        App->>Ctrl: ctrl.set(v) / ctrl.update(fn)
        App->>Ctrl: ctrl.on('resolved', listener)
        Ctrl-->>App: unsubscribe
        App->>Ctrl: ctrl.invalidate()
        Ctrl->>Atom: re‑run factory
        App->>Ctrl: ctrl.release()
        App->>Scope: release(atom)
        Scope->>Scope: run cleanups, remove cache
        App->>Scope: select(atom, selector, { eq })
        Scope-->>App: { get, subscribe }
        App->>Scope: on('resolved', atom, listener)
        Scope-->>App: unsubscribe
    end

    rect rgb(255, 250, 240)
        Note over App,Scope: Introspection
        App->>App: isAtom(v), isFlow(v), isTag(v), isTagged(v)
        App->>App: isPreset(v), isControllerDep(v), isTagExecutor(v)
        App->>App: getAllTags() → Tag[]
    end

    App->>Scope: flush()
    Note right of Scope: wait pending ops
    App->>Ctx: ctx.close()
    Ctx->>Ctx: run onClose (LIFO)
    App->>Scope: dispose()
    Scope->>Scope: release atoms, run cleanups
```

## Composition

```mermaid
graph LR
    subgraph Primitives
        atom["atom({ factory, deps?, tags?, keepAlive? })"]
        flow["flow({ factory, parse?, deps?, tags? })"]
        service["service({ factory, deps? })"]
        tag["tag({ label, default?, parse? })"]
        preset["preset(target, value)"]
    end

    subgraph Wrappers
        typed["typed&lt;T&gt;()"]
        ctrlDep["controller(atom, { resolve? })"]
        tagExec["tags.required/optional/all(tag)"]
    end

    flow --> typed
    atom --> ctrlDep
    tag --> tagExec
```

## Context Data

```mermaid
graph TD
    subgraph "ctx.data"
        raw["Raw: get/set/has/delete/clear/seek"]
        typed["Typed: getTag/setTag/hasTag/deleteTag/seekTag/getOrSetTag"]
    end
    raw --> typed
```

## Atom Lifecycle (AtomState)

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> resolving: resolve() / controller()
    resolving --> resolved: factory completes
    resolving --> failed: factory throws
    resolved --> resolving: invalidate()
    resolved --> idle: release()
    failed --> resolving: invalidate()
    failed --> idle: release()
```

## Tag Resolution

```mermaid
sequenceDiagram
    participant App
    participant Tag
    participant Source as Atom/Flow/Ctx

    App->>Tag: tag({ label, default? })
    Tag-->>App: Tag<T>

    App->>Tag: tag(value)
    Tag-->>App: Tagged<T>

    App->>Source: attach Tagged[] to atom/flow/ctx

    App->>Tag: tag.get(source)
    Tag->>Source: find first match
    Source-->>Tag: value or throw

    App->>Tag: tag.find(source)
    Tag->>Source: find first match
    Source-->>Tag: value or undefined

    App->>Tag: tag.collect(source)
    Tag->>Source: gather all matches
    Source-->>Tag: T[]

    App->>Tag: tag.atoms()
    Tag-->>App: Atom[] with this tag
```

## Type Utilities

```mermaid
graph LR
    subgraph "Lite.Utils"
        AtomValue["AtomValue&lt;A&gt;"]
        FlowOutput["FlowOutput&lt;F&gt;"]
        FlowInput["FlowInput&lt;F&gt;"]
        TagValue["TagValue&lt;T&gt;"]
        DepsOf["DepsOf&lt;A|F&gt;"]
        ControllerValue["ControllerValue&lt;C&gt;"]
        Simplify["Simplify&lt;T&gt;"]
        AtomType["AtomType&lt;T, D&gt;"]
        FlowType["FlowType&lt;O, I, D&gt;"]
    end

    subgraph "Type Guards"
        isAtom
        isFlow
        isTag
        isTagged
        isPreset
        isControllerDep
        isTagExecutor
    end

    subgraph "Convenience"
        AnyAtom
        AnyFlow
        AnyController
    end
```

## Introspection

```mermaid
sequenceDiagram
    participant App
    participant Registry

    App->>Registry: getAllTags()
    Registry-->>App: Tag[] (all live tags)

    App->>App: isAtom(v) / isFlow(v) / isTag(v)
    App->>App: isTagged(v) / isPreset(v)
    App->>App: isControllerDep(v) / isTagExecutor(v)
```

## Additional Exports

```mermaid
graph LR
    subgraph Errors
        ParseError["ParseError (tag | flow-input)"]
    end

    subgraph Meta
        VERSION
    end

    subgraph "Symbols (advanced)"
        atomSymbol
        flowSymbol
        tagSymbol
        taggedSymbol
        presetSymbol
        controllerSymbol
        controllerDepSymbol
        tagExecutorSymbol
        typedSymbol
    end
```

API reference: `packages/lite/dist/index.d.mts`.

## License

MIT
