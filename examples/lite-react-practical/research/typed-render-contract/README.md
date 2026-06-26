# Typed render contract DKR

This spike checks whether a strict spec and catalog can keep designer iteration while preserving pumped-fn's TypeScript and testability value.

The contract deliberately keeps React components as catalog implementations. The spec names catalog components, slots, props, bindings, events, and flows. React lowers that contract into host components, including headless behavior such as a normalized sortable move event.

## Single source of truth for kinds (DKR2)

`ValueKind`, state path tokens, repeat item fields, and action payload kinds are no longer hand-written. One schema vocabulary (`k.string`, `k.number`, `k.boolean`, `k.nullableString`, `k.array`, `k.object`) declares each field exactly once, and that declaration produces three things at the same time:

- the TypeScript type (`BoardState = Infer<typeof boardSchema>`),
- the runtime state token table (`buildStateTokens(boardSchema)`), with `ValueKind` derived per leaf and repeat item fields derived per array element,
- the schema-derived path set (`PathMap<typeof boardSchema>`), including indexed array element paths.

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
- repeat item field outside the catalog-derived item scope

## Compile-time gate

`fixtures.bad.ts` holds `@ts-expect-error` fixtures that prove the typed authoring surface rejects a bad state path, a wrong action input schema, an unknown registry action, and a wrong derived `ValueKind`. Removing any directive surfaces a real `tsc` error.

The accepted DKR checkpoint is not package promotion. Generalized watch/runtime lowering, reusable event normalization, and renderer portability remain open package gates.
