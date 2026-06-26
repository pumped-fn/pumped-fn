# Typed render contract DKR

This spike checks whether a strict spec and catalog can keep designer iteration while preserving pumped-fn's TypeScript and testability value.

The contract deliberately keeps React components as catalog implementations. The spec names catalog components, slots, props, bindings, events, and flows. React lowers that contract into host components, including headless behavior such as a normalized sortable move event.

## Single source of truth for kinds (DKR2)

`ValueKind`, state path tokens, repeat item fields, and action payload kinds are no longer hand-written. One schema vocabulary (`k.string`, `k.number`, `k.boolean`, `k.nullableString`, `k.array`, `k.object`) declares each field exactly once, and that declaration produces three things at the same time:

- the TypeScript type (`BoardState = Infer<typeof boardSchema>`),
- the runtime state token table (`buildStateTokens(boardSchema)`), with `ValueKind` derived per leaf and repeat item fields derived per array element,
- the schema-derived path set (`PathMap<typeof boardSchema>`), whole-array and leaf paths only.

`PathEntry` (type traversal) and `collectTokens` (runtime traversal) now apply one identical rule: recurse objects, emit the whole-array key and stop at arrays, emit leaf keys. So the compile path set and the runtime token set mirror each other — an indexed array-element path such as `/board/cards/0/title` is rejected at both gates (it does not type-check on the author surface and `verifySpec` returns `unknown_state_path`). `buildStateTokens<S>` returns `StateTokenMap<S> = { [P in keyof PathMap<S>]: StateToken }`, so the runtime token record is declared in terms of the type path set, and `StateTokenKeysMirrorPathSet` asserts `keyof typeof stateTokens === Path`.

Action payload kinds come from the flow input schema, and `action(flow, inputSchema)` only type-checks when `Infer<inputSchema>` matches the flow input type, so a `ValueKind` can never be restated incorrectly. `KindFor` is fully generic now (no board-specific `cardArray`), so the kind derivation is not board-specific.

## One action registry for verifier and dispatcher

`actionRegistry` is the only place actions enter the system. The verifier reads it (`context.actions`), the catalog event payloads reference it (`SortableList.events.move = actionRegistry.moveCard.params`), and the React dispatcher (`runJsonAction`) executes only through it. A spec that names an unknown action fails verification (`unknown_flow`) and cannot be dispatched (the dispatcher throws on an unregistered flow).

## Two component families

- Board family: `Stack`, `Text`, `SortableList`, `Card` — the original board case.
- Summary family: `Summary`, `Stat`, `Badge` — a second family authored through the same schema, registry, and verifier, proving the contract is not board-specific. `Stat.value` is a `number` prop, exercising the generalized kind derivation.

Both specs render through React (`view.browser.test.tsx`) over the same Lite scoped value and flows.

The verifier rejects detail-level drift:

- unknown component
- unknown state path
- wrong prop value kind
- unknown slot
- unknown event
- unknown flow
- wrong flow payload kind
- unbound template placeholder
- unreferenced template arg
- non-displayable template arg (an array/object state path interpolated into text)
- repeat item field outside the catalog-derived item scope

Template args are kind-checked at both gates: `author.template` accepts only displayable binds (`DisplayArg`, excluding array/object kinds), and `verifySpec` reports `non_displayable_template_arg` when an arg resolves to `array`/`object`. Numbers and strings still interpolate (`summarySpec` interpolates `/board/metrics/done`).

## Watch-triggered case

`watchSpec` is a standalone spec authored through `createAuthor` whose root `watch` binds `/board/selectedCardId` to the `loadCardDetails` Lite flow. `TypedRenderWatch` wires watches generically (`useWatchEffects` diffs the watched path across renders and dispatches the verified action), and `view.browser.test.tsx` drives a Lite state change and asserts the derived `lastMove` text updates — the durable mutation stays inside the Lite flow.

## Compile-time gate

`fixtures.bad.ts` holds `@ts-expect-error` fixtures that prove the typed authoring surface rejects a bad state path, an indexed array-element path, an array-kind template arg, a wrong action input schema, an unknown registry action, a wrong prop/visibility/event-field kind, and a wrong derived `ValueKind`. Removing any directive surfaces a real `tsc` error.

The mirror-agreement battery (`contract.test.ts`) enumerates candidate bindings — whole-array, leaf, indexed-element, unknown path, and template args of string/number/array/object kind — and asserts compile-acceptance and verifier-acceptance agree on every row, so "no fork" is proven by an exhaustive battery rather than hand-picked fixtures.

The accepted DKR checkpoint is not package promotion. Generalized runtime lowering, reusable event normalization, and renderer portability remain open package gates.
