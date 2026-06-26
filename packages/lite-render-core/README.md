# @pumped-fn/lite-render-core

Platform-neutral strict spec/catalog render contract for `@pumped-fn/lite`. This is the **core** half of a
core/react split (mirroring json-render): it owns the portable spec types, the schema vocabulary, the typed
authoring surface, and the runtime verifier. It has **no React dependency** — a separate adapter package
lowers a verified spec to host components.

The contract is generic over an arbitrary state schema, component catalog, and action registry. A spec names
catalog components, slots, props, bindings, events, and flows; the verifier checks every detail against the
trusted catalog/registry/state-token set, and the typed author surface rejects the same drift at compile time.

## Pipeline

```
k (schema vocab) ─┬─> Infer<S>            (TypeScript types)
                  ├─> buildStateTokens(S) (runtime state tokens, per-leaf kind + per-array item context)
                  └─> PathMap<S>          (schema-derived path set: whole-array + leaf paths only)

defineCatalog(...) ─> TypedCatalog   (prop schemas reduced to ValueKind)
action(flow, input) ─> ActionToken   (param kinds derived from the flow input schema)

createAuthor({ catalog, registry, schema }) ─> typed JSON  ──┐
                                                              ├─> verifySpec(spec, ctx) ─> ok | errors
raw JsonSpec ─────────────────────────────────────────────────┘

createRunJsonAction({ registry, state }) ─> dispatcher flow (executes only registered actions)
```

## Public API

Schema vocabulary and kinds: `k`, `leaf`, `kindOf`; types `ValueKind`, `KindFor`, `FieldsKindOf`,
`KindOfSchema`, `Infer`, `BaseSchema`, `LeafSchema`, `ArraySchema`, `ObjectSchema`, `DisplayKind`,
`CondLiteral`, `JsonValue`.

Spec and verification types: `JsonExpr`, `JsonAction`, `JsonCondition`, `JsonNode`, `JsonSpec`, `RepeatSlot`,
`SlotSpec`, `ComponentSchema`, `ItemContext`, `StateToken`, `ActionToken`, `VerifyContext`,
`VerificationError`, `VerificationResult`.

Tokens and paths: `buildStateTokens`, `statePath`; types `CollectTokens`, `PathEntry`, `PathMap`, and the
agreement predicates `StateTokenKeysMirrorPathSet<S>`, `NoObjectKindStatePath<S>`.

Catalog: `defineCatalog`; types `CatalogInput`, `TypedCatalog`.

Actions: `action` (binds a `Lite.Flow` to its input schema), `createRunJsonAction` (the registry-driven
dispatcher), `readPath`, `resolveExpr`, `actionParams`; type `RenderActionInput`.

Verifier: `verifySpec`, `isRepeatingSlot`, `hasRepeatingSlot`; type `IsRepeatingSlotGuardsRepeatSlot`.

Author: `createAuthor`; types `Author`, `Authored`, `ItNeverEdgeUnconstructible`.

## What the verifier rejects

unknown component, unknown/missing prop, wrong prop value kind, unknown slot, unknown event, unknown flow,
wrong flow payload kind, unbound template placeholder, unreferenced template arg, non-displayable template
arg (array/object interpolated into text), repeat item field outside the catalog-derived item scope,
unsupported renderer capability, invalid `visible.eq` literal kind, and a nested repeating slot
(`nested_repeat_forbidden`: a repeating-slot component anywhere inside another repeating slot, directly or
transitively).

## Single-source predicates

- **Displayable kinds**: `nonDisplayableKinds` drives both the `DisplayKind` author type and the runtime
  `displayableKinds` set.
- **Comparison literals**: one `condLiterals` table drives `CondLiteral<K>` and the runtime `literalMatches`.
- **Is-a-slot-repeating**: `isRepeatingSlot` (repeats-presence discriminant) drives both gates;
  `IsRepeatingSlotGuardsRepeatSlot` pins its guarded type to `RepeatSlot`.
- **One action registry** is read by the verifier and executed by `createRunJsonAction`; an unregistered
  action fails verification and cannot be dispatched.

## Repeat items mirror the verifier for every element shape

A repeating slot's `it(field)` accessor is **single-sourced from the same element schema the verifier's
`ItemContext` walks**, not from the inferred element value type. `ItemFieldsOf<ElementSchema>` keys `it` by
the element `ObjectSchema`'s declared fields and types each by its schema-derived kind (mirroring
`fieldsKindOf`/`itemContextOf`); a non-object element (`string[]`, `number[][]`, `rowSchema[][]`) exposes
**no** named fields, mirroring the verifier returning an empty item context. So compile-acceptance and
verifier-acceptance agree for every element shape:

- **Object element**: `it("name")` resolves to the field's schema kind; `it("meta")` on a nested-object
  field has kind `object` (not assignable to a scalar prop — matches `kind_mismatch`); `it("length")` is not
  a declared field (compile error — matches `unknown_item_path`).
- **Primitive / array-of-arrays / array-of-arrays-of-objects element**: no `it(...)` field is callable
  (matches the verifier always rejecting an item binding there). Such a slot still repeats; its children just
  cannot bind an element field (the spec grammar has no value-item form).

`tests/second.fixture.ts` exercises five repeating-slot components over object, flat-object, primitive-array,
array-of-arrays, and array-of-arrays-of-objects element shapes; `tests/second.test.ts` runs a 28-row
mirror-agreement battery (every row compile-verdict === verifier-verdict) and `tests/second.fixtures.bad.ts`
holds the compile-fail proofs. The bounded board fixture (`tests/board.fixture.ts`, `tests/contract.test.ts`,
27 tests + the 21-row board battery + `tests/fixtures.bad.ts`) is unchanged and stays green.

The nested-repeat ban (transitive, across all repeating-slot components), the `it:never` unconstructibility
of non-state repeat sources, and the single-source displayable/comparison/repeats predicates all hold
generically.

`/` is reserved as the path delimiter: `k.object` rejects a field key containing `/` at compile time, so a
JSON-pointer path can never confuse a field literally named `a/b` with nesting `a` → `b`. This keeps the
author's schema walk (`SchemaAtPath`) an exact inverse of the verifier's token walk (`collectTokens`).
`ItemFieldsOf` is additionally non-distributive (`[E] extends [never] ? {} : …`), so any unresolved element
yields an uncallable accessor rather than an over-permissive one.

## License

MIT
