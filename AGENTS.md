# Pumped-fn

## Dependencies
- `dependencies`/`devDependencies`: `catalog:` version specifier (add to `pnpm-workspace.yaml` first)
- `peerDependencies`: explicit ranges (e.g. `^19.0.0`) — not catalog-managed

## Code Style (No Slop)
No:
- Inline or block comments (TSDoc on public interfaces only)
- Defensive try/catch or null checks in trusted codepaths
- `any` to bypass type issues — fix the types. Exception: `any` is correct at library boundaries where variance makes a precise type unsound:
  - Contravariant function fields in covariant generic containers (e.g. `eq?: (a: any, b: any) => boolean` on `Interface<T>` used as `Interface<unknown>` in a union — `T` would break `Interface<number>` assignability)
  - Type-erased dispatch slots (extension hooks, runtime-dispatched factories)
  - Rule: precise type at the **call site** (`Options<T>`), `any` on the **stored field** only
- Single-use variables declared then immediately returned (inline them)
- Style inconsistent with surrounding code
- Type suffixes on definition handles — `const store = atom(…)`, `const runCheck = flow(…)`, `const tx = resource(…)`, `const requestId = tag(…)`; never `storeAtom`/`runCheckFlow`/`txResource`/`requestIdTag`. The type system carries the kind; rely on inference (deps shorthand, factory params shadow handles)
- Ceremony the graph already does — no `atom<Port>(…)` generics (atoms share their inferred type; substitutes conform via `satisfies`/`Lite.Utils.AtomValue`), no facade objects bundling flows behind methods (consumers import the flows they use and exec them directly), no hand-written interfaces restating inferable signatures (extract via `ReturnType`/`Lite.Utils.*` when a name is needed)
- Shared scopes and glue types — never a pre-configured scope factory (every use site calls `createScope` with what it needs; shared builders reduce compositionality); named types only at data-transfer boundaries (flow inputs via `typed<T>()`, domain models, multi-implementor contracts) — wiring/output types nothing consumes must not exist

## Testing Rule
The scope is the single seam: given only `createScope({presets, tags, extensions})` + the public API, all logic is testable. Inside-out vs outside-in = same seam, different radius (preset a unit's deps vs preset only edge adapters). A test needing more than a scope (global patches, module mocks, internal reaches) means the design leaked — fix the design. Sole exception: an adapter atom's own unit test may fake the global it wraps (below the seam).

## PR Checklist
- `README.md` diagram reflects changes
- PR has docs, slop-free
