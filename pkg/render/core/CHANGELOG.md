# @pumped-fn/lite-render-core

## 1.0.0

### Patch Changes

- Updated dependencies [174cd70]
  - @pumped-fn/lite@4.0.0

## 0.1.0

### Minor Changes

- 8e8632f: Add the strict spec/catalog render contract as two packages, following json-render's core/react split.

  `@pumped-fn/lite-render-core` owns the portable spec, the schema vocabulary (`k`), the typed authoring surface, and the runtime verifier — generic over an arbitrary state schema, catalog, and action registry, with no React dependency. `@pumped-fn/lite-render-react` lowers a verified spec to React over a Lite scope via a typed component-implementation map.

  `defineRender({ schema, state, catalog, actions })` and `defineView(contract, impls)` give a fully inferred, annotation-free surface; the typed author surface and the runtime verifier are kept in agreement so what type-checks is what verifies.
