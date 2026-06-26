# Typed render contract DKR

This spike checks whether a strict spec and catalog can keep designer iteration while preserving pumped-fn's TypeScript and testability value.

The contract deliberately keeps React components as catalog implementations. The spec names catalog components, slots, props, bindings, events, and flows. React lowers that contract into host components, including headless behavior such as a normalized sortable move event.

## Single source of truth for kinds (DKR2)

`ValueKind`, state path tokens, repeat item fields, and action payload kinds are no longer hand-written. One schema vocabulary (`k.string`, `k.number`, `k.boolean`, `k.nullableString`, `k.array`, `k.object`) declares each field exactly once, and that declaration produces three things at the same time:

- the TypeScript type (`BoardState = Infer<typeof boardSchema>`),
- the runtime state token table (`buildStateTokens(boardSchema)`), with `ValueKind` derived per leaf and repeat item fields derived per array element,
- the schema-derived path set (`PathMap<typeof boardSchema>`), whole-array and leaf paths only.

`PathEntry` (type traversal) and `collectTokens` (runtime traversal) now apply one identical rule: recurse objects, emit the whole-array key and stop at arrays, emit leaf keys. So the compile path set and the runtime token set mirror each other — an indexed array-element path such as `/board/cards/0/title` is rejected at both gates (it does not type-check on the author surface and `verifySpec` returns `unknown_state_path`).

`buildStateTokens<S>` returns `CollectTokens<S, "">`, an **independent structural recursion** that mirrors `collectTokens` (recurse objects, emit one key per array and per leaf) — it is no longer defined from `PathMap`. So `StateTokenKeysMirrorPathSet = Assert<Equal<keyof typeof stateTokens, Path>>` is no longer tautological: it cross-checks two independent type traversals (`CollectTokens` against `PathEntry`/`PathMap`). Injecting a bogus extra key into `CollectTokens` (for example descending into arrays to re-introduce indexed-element keys) makes `tsc` fail this assert. The runtime conformance of `collectTokens` itself is guarded by a separate test (`state-token runtime mirror`) asserting `Object.keys(context.state)` equals the schema-derived path set; the cast at the `buildStateTokens` boundary cannot surface that drift at `tsc` because TypeScript cannot infer literal keys from a dynamic schema walk, so this one binding is construction-guarded at the type-traversal boundary and test-guarded at the runtime-emit boundary.

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
- repeat item field outside the item scope derived from the bound array prop
- nested repeating slot (`nested_repeat_forbidden`: a repeating-slot component anywhere inside another repeating slot's subtree, directly or transitively)

## Repeat item derived from the bound array prop (by construction)

A repeating slot is no longer authored with a hand-passed item schema (`author.repeat(cardSchema, ...)`, which could fork from the bound array). It is now a bare function `item: (it) => [...]` whose `it` accessor is **cross-field-derived** from the state path bound at `props[slot.repeats]` — the same prop `verifySpec`'s `repeatItemContext` reads. Binding `props.items` to `/board/columns` forces `it` to columns' element fields, so `it("done")` fails to compile (`Argument of type '"done"' is not assignable to parameter of type '"id" | "title"'`) and `verifySpec` rejects the same binding with `unknown_item_path`. Author-acceptance and verifier-acceptance key off one source, so the repeat dimension cannot fork.

Template args are kind-checked at both gates: `author.template` accepts only displayable binds (`DisplayArg`, excluding array/object kinds), and `verifySpec` reports `non_displayable_template_arg` when an arg resolves to `array`/`object`. Numbers and strings still interpolate (`summarySpec` interpolates `/board/metrics/done`).

## Nested repeating slots forbidden by construction (transitively)

A repeating slot replaces the item context at its boundary, so an outer repeat's `it` accessor used inside an inner repeat would silently resolve against the wrong array (or, on a same-kind field-name collision, render the wrong element — a hole the depth-less JSON cannot let the verifier catch). The catalog is therefore restricted so nested repeats are **unconstructible**, not merely error-flagged. The restriction is transitive: once inside a repeating slot, no descendant through any slot may be a component that itself has a repeating slot.

One predicate drives both gates from the same catalog slot data — "a component has a repeating slot" — so the forbidden set is never hand-written twice:

- **Author types**: every `author.node(...)` carries a phantom `Authored<HasRepeatInSubtree>` flag computed bottom-up — true if the component itself has a repeating slot (`HasRepeatSlot<C, T>` over `C[T]["slots"]`) or any plain-slot child's subtree carries the flag (`SlotsContainRepeat`). A repeating slot's `(it) => readonly Authored<false>[]` builder accepts only repeat-free subtrees, so placing a `SortableList` (or a `Stack` that transitively contains one) inside an `item` builder fails to compile (`Type '() => Authored<true>[]' is not assignable to ... readonly Authored<false>[]`). The flag is type-only and never serialized.
- **Verifier**: `verifyNode` carries an `insideRepeat` flag (set true when recursing into a repeating slot, inherited through plain slots) and `hasRepeatingSlot(component)` reads the same catalog `slots` the author type reads; a repeating-slot component reached while `insideRepeat` is rejected with `nested_repeat_forbidden`.

Because the silent-collision variant required an inner repeat to exist, it is unconstructible once nesting is forbidden. `fixtures.bad.ts` and the mirror-agreement battery prove both the direct (`SortableList` in `SortableList.item`) and transitive (`SortableList -> Stack -> SortableList`) cases fail to compile and verify as `nested_repeat_forbidden`. A top-level repeating-slot component (a repeat not inside another repeat, as in `boardSpec`) stays valid.

## Watch-triggered case

`watchSpec` is a standalone spec authored through `createAuthor` whose root `watch` binds `/board/selectedCardId` to the `loadCardDetails` Lite flow. `TypedRenderWatch` wires watches generically (`useWatchEffects` diffs the watched path across renders and dispatches the verified action), and `view.browser.test.tsx` drives a Lite state change and asserts the derived `lastMove` text updates — the durable mutation stays inside the Lite flow.

## Compile-time gate

`fixtures.bad.ts` holds `@ts-expect-error` fixtures that prove the typed authoring surface rejects a bad state path, an indexed array-element path, an array-kind template arg, a wrong action input schema, an unknown registry action, a wrong prop/visibility/event-field kind, a wrong derived `ValueKind`, a repeat item field outside the bound-array element schema, a repeat item forked onto a different array prop, and a repeating-slot component nested (directly and transitively) inside a repeating slot. Removing any directive surfaces a real `tsc` error.

The mirror-agreement battery (`contract.test.ts`, 21 rows) now enumerates candidate bindings across all dimensions — state-path (whole-array, leaf string/number/nullable/boolean, indexed-element, unknown path), template-arg (string/number/array/object), repeat-item (aligned and forked-onto-another-array), event (aligned and field-kind fork), action-param (literal kind fork), visible (aligned and eq-literal kind fork), watch (aligned and unknown-path fork), and nested-repeat (direct and transitive) — and asserts compile-acceptance and verifier-acceptance agree on every row, so "no fork" is proven by a per-dimension battery rather than hand-picked fixtures. Most dimensions agree by construction (author types and verifier read the same catalog/registry/`Path`/element source); the battery is the regression net that fails if any dimension drifts.

The accepted DKR checkpoint is not package promotion. Generalized runtime lowering, reusable event normalization, and renderer portability remain open package gates.
