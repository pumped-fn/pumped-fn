# @pumped-fn/lite-render-core

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Platform-neutral strict spec/catalog render contract for `@pumped-fn/lite`.

This is the **core** half of a core/react split (mirroring json-render): it owns the portable spec types, the
schema vocabulary (`k`), the typed authoring surface, and the runtime verifier. It has **no React dependency** —
`@pumped-fn/lite-render-react` lowers a verified spec to host components. The contract is generic over an
arbitrary state schema, component catalog, and action registry; `@pumped-fn/lite` still owns state, flows,
resources, tags, presets, and tests.

A spec names catalog components, slots, props, bindings, events, and flows. The verifier checks every detail
against the trusted catalog / action registry / state-token set, and the typed authoring surface rejects the
same drift at compile time — so a designer- or server-authored JSON spec keeps the TypeScript and testability
guarantees pumped-fn is built on.

## When to Use

Use this when the *spec itself* is the thing you ship — generated specs, schema-driven editors, server-authored
forms, embedded surfaces — and it must stay strict: the JSON is portable, but every binding is checked against
your schema and catalog at both compile and run time. The timing is the integration edge, after the state model
and action flows have clear Lite owners.

Do not use it to make hand-authored React more indirect. If the UI is ordinary React, render from
`useScopedValue` and mutate through scoped actions instead.

## Install

```bash
npm install @pumped-fn/lite @pumped-fn/lite-render-core
```

## Usage

`defineRender` is the entry point: pass one `{ schema, state, catalog, actions }` and get a fully inferred
`{ author, verify, dispatch, context, state }`. Author, verifier, and dispatcher are wired from the same
sources so they cannot drift; `rendererCapabilities` is derived from the catalog. Authoring, verifying, and
dispatching need **no type annotations**.

```ts
import { action, defineRender, k } from "@pumped-fn/lite-render-core"
import { flow, resource, typed } from "@pumped-fn/lite"

const cardSchema = k.object({ id: k.string, label: k.string, done: k.boolean })
const boardSchema = k.object({ board: k.object({ cards: k.array(cardSchema), heading: k.string }) })

const store = resource({
  factory: () => ({ board: { cards: [], heading: "Tasks" } }),
})
const toggle = flow({ name: "toggle", parse: typed<{ id: string }>(), deps: { access: store }, factory: (ctx) => ctx.input.id })
const actions = { toggle: action(toggle, k.object({ id: k.string })) }

const render = defineRender({
  schema: boardSchema,
  state: store,
  catalog: {
    Board: { props: { heading: k.string, cards: k.array(cardSchema) }, slots: { rows: { repeats: "cards" } }, events: {}, capabilities: ["layout.board"] },
    Card:  { props: { label: k.string, done: k.boolean }, slots: {}, events: { toggle: actions.toggle.params }, capabilities: ["surface.card"] },
  },
  actions,
})

const spec = render.author.spec(render.author.node("Board", {
  props: { heading: "Tasks", cards: render.author.state("/board/cards") },
  slots: { rows: (it) => [render.author.node("Card", {
    props: { label: it("label"), done: it("done") },
    on: { toggle: () => ({ flow: "toggle", params: { id: it("id") } }) },
  })] },
}))

render.verify(spec) // { ok: true, spec }
```

Write the `catalog` inline in the `defineRender` call. Extracting it to a `const` widens the `repeats` slot
literal to `string` and breaks the typed repeat builder — the same inline-config pattern as Vite's
`defineConfig`.

The manual primitives stay available, and `defineRender` is built on them: `buildStateTokens`, `defineCatalog`,
`createAuthor`, `verifySpec`, `createRunJsonAction`, plus a hand-written `rendererCapabilities`. Use them
directly only when you need to assemble the pieces yourself.

## Behavior Surface

The verifier rejects — at run time, and through the typed author surface at compile time — unknown component;
unknown / missing / wrong-kinded prop; unknown slot, event, or flow; wrong flow-payload kind; unbound or
unreferenced template placeholder; a non-displayable (array/object) template arg; a repeat item field outside
the catalog-derived item scope; an unsupported renderer capability; an invalid `visible.eq` literal kind; and a
nested repeating slot (a repeating-slot component anywhere inside another, directly or transitively).

**`on` events vs `watch`.** An `on` event fires per rendered instance, so inside a repeat its action params may
bind `{ item: … }` — the host passes the live repeat element at dispatch. A `watch` is global change-detection
(one per authored node, fired on the absolute state path, not per row), so `{ item: … }` is meaningless there
and is rejected on both gates; watch params take literal / `{ state: … }` / template binds only.

The compile gate and the runtime verifier stay in agreement by construction: the author's accepted bindings
derive from the same schema/catalog/registry the verifier reads, across every element shape — so what
type-checks is what verifies.

## Exports

- `defineRender` — one inferred `{ author, verify, dispatch, context, state }` from `{ schema, state, catalog, actions }`.
- `k`, `leaf`, `kindOf` — the schema vocabulary and kind classification.
- `action`, `createRunJsonAction`, `readPath`, `resolveExpr`, `actionParams` — action binding and the
  registry-driven dispatcher; `RenderActionInput<Item, Event>` is `{ action, item?, event? }`.
- `defineCatalog`, `buildStateTokens`, `statePath` — catalog and state-token / path derivation.
- `createAuthor`, `verifySpec`, `isRepeatingSlot`, `hasRepeatingSlot` — authoring and verification.
- Spec, kind, token, and agreement types: `JsonSpec`, `JsonNode`, `JsonExpr`, `JsonAction`, `VerifyContext`,
  `VerificationResult`, `ValueKind`, `Infer`, `PathMap`, `TypedCatalog`, `Author`, and more — see `src/index.ts`.

## Testing

The contract is plain data and synchronous functions: build a `defineRender(...)`, author a spec, and assert
`render.verify(spec)` plus `render.dispatch` behavior. State and flows resolve through `createScope` from
`@pumped-fn/lite` — no React and no module mocks. The runtime verifier is the source of truth for any raw
`JsonSpec`; the typed author surface is its compile-time mirror.

## License

MIT

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
