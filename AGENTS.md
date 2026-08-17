# Pumped-fn

## Dependencies
- `dependencies`/`devDependencies`: `catalog:` version specifier (add to `pnpm-workspace.yaml` first)
- `peerDependencies`: explicit ranges (e.g. `^19.0.0`) — not catalog-managed

## Prime Rationale
Always fully traceable and fully testable: no implicits, no uncontrolled side effects. Effects exist only as controlled graph edges — visible to the exec pipeline (flows, port flows, role-tag implementors, one-depth traced members) and substitutable through the scope seam.

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

## Change Safety
- Adding or changing a failure mode obliges you to enumerate every caller before merging. A function that could not throw and now throws, or a lifecycle that ended and now continues, silently invalidates the assumptions its callers were written under. Passing tests do not cover this; the call sites do.
- Release order is implement, review the diff by reading, adversarial pass, verify each finding independently, then release. Adversarial findings are evidence, never authority — treat a clean report and an alarming one with equal suspicion, and reproduce a finding before it changes a decision.
- A test may never assert a guarantee the release does not ship, and a test fake must behave like the real dependency. A fake that ignores a signal the real process honors will prove a fix that does not work.
- Gates either block or they do not. A gate that fails for reasons unrelated to the change trains everyone to re-run it, and eventually someone re-runs past a real failure. Poll for a condition instead of sleeping a fixed interval in timing-dependent tests.

## Release Policy
- Defect fixes ship on the current line. Renames and consistency changes batch into a major consumers opt into. Never make a consumer accept a breaking migration to receive a correctness or security fix.
- Raising a peer floor is breaking. Requiring a newer peer forces a major even when the change itself reads as additive.

## PR Checklist
- `README.md` diagram reflects changes
- PR has docs, slop-free
- If a public example avoids a helper this repo ships, the helper is wrong — fix the helper, not the example
