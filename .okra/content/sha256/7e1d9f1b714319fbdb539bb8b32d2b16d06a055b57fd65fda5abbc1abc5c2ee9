# DKR-L1 lint rule coverage map

Decision target: classify the confirmed pumped-fn authoring doctrine into reliable TypeScript-parser lint, compile/API assertions, or scope-level conformance tests.

Status: candidate learning only. The orchestrator must accept the checkpoint before promoting CKR-L1 or funding any PKR.

Candidate CKRs and candidate PKRs are not promoted until the orchestrator accepts the supporting DKR learning checkpoint.

## Decision

Use a three-part read. Syntax lint catches only local shapes. Compile/API assertions freeze public module shape. Scope-level conformance proves dependency resolution, substitution, and execution edges.

```text
source syntax ── lite-lint
public shape  ── typecheck + API assertion
graph meaning ── createScope conformance
```

Do not add a general `no-implicit-binding` or namespace-alignment lint rule. A parser cannot know whether `createClient()`, an exported object, or two handles are semantically a built-in capability, a facade, or one module family. Those claims need an exact provider API contract and scope behavior.

Two missing doctrine shapes are narrow enough for parser lint:

1. `pumped/no-explicit-atom-type-argument`: reject an explicit type argument on a lite `atom(...)` call.
2. `pumped/no-immediate-return-binding`: reject a single identifier declared in one variable statement and returned unchanged by the immediately following statement in the same block.

Both are candidate rules, not accepted implementation work.

## Evidence map

| Evidence | What it establishes |
| --- | --- |
| `AGENTS.md:6-30` | Ratified repo-local code style and the single scope seam |
| `skills/pumped-fn/SKILL.md:26-45` | Shipped authoring guidance and current lint/review split |
| `pkg/tool/lint/src/index.ts:1-109` | Current parser-only rule surface, severities, and configuration |
| `pkg/tool/lint/src/index.ts:1267-1816` | Current AST checks for config closure, mocks, direct flow composition, tag reads, globals, handle shapes, scopes, and factories |
| `pkg/tool/lint/tests/scanner.test.ts:20-220` | Direct-flow, context, and scope fixtures |
| `pkg/tool/lint/tests/scanner.test.ts:231-361` | Mock and scope-argument fixtures |
| `pkg/tool/lint/tests/scanner.test.ts:416-550` | Tag/global/composition fixtures |
| `pkg/tool/lint/tests/scanner.test.ts:666-739` | Deliberate fail-open behavior for unresolvable dependency objects |
| `pkg/tool/lint/tests/scanner.test.ts:1007-1062` | Handle-factory and config-closure fixtures |
| `pkg/tool/lint/README.md:18-58` | Documented rule semantics, known misses, warning behavior, and limited root scan |
| `package.json:5-15` | Root lint scans docs/examples, not provider and core package source |
| `pkg/sdk/claude/src/index.ts:30-73` | Current config tag, built-in environment atom, flow deps, and flat provider exports |
| `pkg/sdk/codex/src/index.ts:42-206` | Current config tags, built-in environment/working-directory atoms, ACP resource, deps, and flat exports |
| `pkg/sdk/claude/tests/claude.test.ts:12-52` | Existing public scope seam and preset replacement proof |
| `pkg/sdk/codex/tests/codex.test.ts:26-82` | Existing CLI/ACP scope seam and preset replacement proof |

Source hashes observed at 2026-07-13T04:10:06Z:

| Source | SHA-256 |
| --- | --- |
| `AGENTS.md` | `be33e6ec129d3a1bb23edcf72b403273c40d44f7a4d79a33a68aaf76e6de7008` |
| `pkg/tool/lint/src/index.ts` | `472c729aab2799759c6e29b1e10cde45a2aaecd9ac499cbc510cb7405c1515d2` |
| `pkg/tool/lint/tests/scanner.test.ts` | `85f0372edced14cca3933a06ee0518991660229090f721d1e5d878eac1c14273` |
| `pkg/tool/lint/README.md` | `b0023b317c12fc21e271d5f793c07bd9ff99c239263fc8fe590239595bc4f731` |
| `package.json` | `1209b7959fbe3cb1461428e2f137cf251854cf95bc68955c99af2dde499d6e54` |

## Anti-goal classification

| Wall | Reliable parser lint | Compile/API assertion | Scope-level conformance | Read status after candidate delivery |
| --- | --- | --- | --- | --- |
| AG-8 `touched_file_lint_violation_count` | Run every current rule over the exact changed source/test/doc manifest and count warnings as violations. Existing CLI exit status alone is insufficient because eight rules default to warning. | Run package typecheck for every touched package. | Not needed for the lint metric. | Readable now if the orchestrator records the changed-path manifest and parses JSON diagnostics instead of relying on exit code. |
| AG-9 `implicit_required_dependency_count` | Existing `config-via-tags`, `no-implicit-tag-read`, `no-naked-globals`, `no-module-state`, and `no-direct-flow-composition` catch local syntactic escapes. | Assert expected config/engine/transport handles and their public types after DKR-2 chooses the surface. | Construct a scope without each required tag/preset in turn and assert dependency resolution fails before execution; then supply it through `createScope({ tags, presets, extensions })` and prove replacement. | Reducing path is deterministic; not fully readable from lint alone. |
| AG-10 `unrequested_builtin_binding_count` | No new general rule. Constructor names and dependency meanings are not syntax. Existing ambient/global rules catch only raw platform bindings. | Assert the accepted provider namespace/export list contains the required config and engine handles and no default provider singleton beyond the approved model tag. | Missing config, engine, transport, auth, and permission cases must fail closed. A fake supplied at the scope seam must be the only success path in the focused test. | Becomes readable only after DKR-2 and DKR-3 name exact required bindings. |
| AG-11 `scope_seam_escape_count` | Existing `no-module-mocks`, `no-test-only-branches`, `no-scope-argument`, `no-ctx-argument`, `no-scope-reach`, and `no-shared-scope-factory`. Refine the adapter-test exception before claiming complete coverage. | Compile tests importing only the package public entrypoint; reject internal import paths through an explicit test import manifest/API assertion. | Provider logic tests construct only `createScope({ tags, presets, extensions })`, use public handles, replace boundary adapters, and close context/scope. | Deterministic bundle required; current lint has a known adapter-test mismatch. |
| AG-12 `ungrouped_related_handle_count` | No generic rule. “Related” and “meaningful namespace” are semantic, and barrel/re-export forms make file-local syntax misleading. | After DKR-2 accepts a module surface, compare the exact emitted declarations/export keys with the approved namespace shape. This is the source read. | One consumer fixture imports the namespace and wires it through a scope. | Reducing DKR-L1 conclusion: fund an exact provider API assertion, not lint. |
| AG-13 `hidden_execution_edge_count` | Existing `no-direct-flow-composition`, `no-unattributed-await`, `no-ctx-argument`, `no-scope-reach`, `no-naked-globals`, and `no-ambient-io-outside-boundary` cover local visible shapes. | Assert entry flows and dependency handles retain their accepted public types. Types cannot prove runtime attribution. | Preset each child/boundary edge independently, execute through the public entry flow, and assert only the substitute was called; inspect trace events for the declared edge names. | Deterministic bundle required; parser-only acceptance would be a false claim. |
| AG-14 `redundant_graph_ceremony_count` | Existing handle suffix/factory/spread, shared-scope, deps-destructuring, ctx-argument, and direct-composition rules. Add only the two narrow candidate rules above. | Exact public API/export assertion rejects wiring-only exported types and facade methods for the accepted provider contract. | A consumer conformance fixture directly imports and executes handles, proving no runtime facade is required. | Becomes readable from the lint plus exact-API plus consumer-fixture bundle. |

## Existing lint coverage and bounded gaps

| Doctrine | Existing coverage | Exact bounded gap | Treatment |
| --- | --- | --- | --- |
| Configuration passes through tags | `config-via-tags` catches direct enclosing identifier capture; `no-implicit-tag-read` catches direct `seekTag`/`getTag` and `scope.resolve`; `no-naked-globals` catches common environment reads. | Destructured parameters, aliases, helper forwarding, module-level immutable config, member/computed tag expressions, and unresolved external deps objects. | Preserve conservative lint; prove named required bindings by missing-tag conformance. |
| Required tags appear in static deps | `no-implicit-tag-read` compares direct identifier tag reads with resolvable `tags.required/optional/all` deps. | It intentionally emits nothing when deps are imported or built by a call; it cannot distinguish required from optional use intent without the accepted contract. | Missing-tag conformance plus exact API assertion. Do not make unresolvable shapes fail by default. |
| No built-in engine/config/transport/auth | Ambient/global and config-closure rules catch a subset. | `createEngine()`, `new SDKClient()`, or imported singleton use may be valid data construction or an illicit capability; names are not proof. | Exact required-binding matrix from DKR-2/DKR-3 plus fail-closed scope tests. |
| Explicit graph edges | `no-direct-flow-composition` catches `ctx.exec({ flow })` in a flow and raw same-file flow deps; attribution/global/context rules catch adjacent escapes. | Imported or aliased flows, helper-built configs, indirect calls, and arbitrary imported effectful functions are not type-resolved by this scanner. | Scope substitution and trace conformance. |
| Scope is the test seam | Mock, test-branch, scope/context argument/reach, and shared-scope rules cover common syntax. | Test paths are exempt from `no-scope-reach`; global `spyOn` is rejected even for the allowed adapter-atom unit-test exception; public-versus-internal imports are not checked. | Refine mock handling; add public-entrypoint scope conformance and an import-boundary assertion. |
| Related handles share a namespace | None. | The parser cannot infer relatedness, approved namespace name, barrel ownership, or whether a data-only export object is a facade. | Exact declaration/API assertion after shared-contract acceptance. |
| No graph-hiding facade | Scope/context/direct-flow rules reject common method wrappers. | Generic exported objects may be data namespaces or facades; cross-file behavior is not visible. | Exact provider export assertion plus scope/trace conformance. No broad object-shape rule. |
| No redundant ceremony | Suffix, handle factory, handle spread, shared scope, whole-deps, and ctx rules cover several shapes. | Explicit `atom<T>`, immediate return bindings, inferred-signature restatements, and wiring-only types are uncovered. Only the first two are syntax-stable. | Add two narrow lint candidates; use exact API assertion for exported glue types; do not lint subjective internal type “need.” |

## Candidate parser fixtures

### `pumped/no-explicit-atom-type-argument`

Invalid:

```ts
import { atom } from "@pumped-fn/lite"

interface Engine {
  run(prompt: string): Promise<string>
}

export const engine = atom<Engine>({
  factory: () => ({ run: async (prompt) => prompt }),
})
```

Valid:

```ts
import { atom, type Lite } from "@pumped-fn/lite"

export const engine = atom({
  factory: () => ({ run: async (prompt: string) => prompt }),
})

const replacement = {
  run: async (prompt: string) => prompt,
} satisfies Lite.Utils.AtomValue<typeof engine>
```

Provable invariant: a call resolved syntactically to the imported lite `atom` creator has `typeArguments.length > 0`.

Known false negatives: re-exported aliases the import collector cannot resolve, wrapper functions, and creator calls returned by helpers. Known false positives: none for the confirmed doctrine; a low-level constructor needing an explicit generic would require human doctrine change, not a suppression.

### `pumped/no-immediate-return-binding`

Invalid:

```ts
export function parse(value: string) {
  const result = JSON.parse(value)
  return result
}
```

Valid:

```ts
export function parse(value: string) {
  const result = JSON.parse(value)
  validate(result)
  return result
}
```

Provable invariant: within one block, a variable statement with exactly one identifier declaration is immediately followed by `return <same identifier>`.

Known false negatives: destructuring, multi-declaration statements, assignments separated from declarations, and returns through aliases. Known false positives: none for the literal “declared then immediately returned” doctrine. Automatic fixing is out of scope.

## Existing rule fixture corrections

### Adapter atom global test exception

Allowed by AGENTS.md but currently rejected by `no-module-mocks`:

```ts
import { vi } from "vitest"

vi.spyOn(globalThis, "fetch")
```

Do not broadly allow `spyOn`. A candidate refinement should continue rejecting spies on imported product modules while allowing a focused global fake only in an adapter atom's own unit test. If the parser cannot prove “adapter atom's own test” without path/config conventions, leave the exception to a named test config and scope it to the exact adapter test path.

### Unresolvable deps fail open

Known and intentionally non-diagnostic:

```ts
import { sharedDeps } from "./deps"

const run = flow({
  deps: sharedDeps,
  factory: (ctx) => ctx.data.seekTag(config),
})
```

Turning this into an error would confuse “parser could not resolve” with “tag was omitted.” Keep the lint false negative documented and use dependency-resolution conformance.

## Compile/API assertion fixtures

The exact namespace syntax remains a DKR-2 decision. Once accepted, compile an external consumer against only the package entrypoint and compare the emitted public keys to the approved set.

Candidate shape for discussion, not promotion:

```ts
import { claude } from "@pumped-fn/sdk-claude"

void claude.config
void claude.engine
void claude.run
void claude.turn
void claude.provider
```

The assertion must reject legacy or accidental top-level engine/config/facade exports only after the migration surface is human-approved. A generic rule requiring all tags or engines to be namespaced would incorrectly flag intentionally independent tags and core constructors.

## Scope conformance fixtures

Required-binding failure:

```ts
const scope = createScope()
const ctx = scope.createContext()

await expect(ctx.exec({ flow: claude.turn, input })).rejects.toMatchObject({
  kind: "missing-tag",
})
```

Scope replacement success:

```ts
const scope = createScope({
  presets: [preset(claude.engine, fakeEngine)],
  tags: [claude.config(config)],
})
const ctx = scope.createContext()

await expect(ctx.exec({ flow: claude.turn, input })).resolves.toEqual(expected)
```

Edge visibility:

```ts
const scope = createScope({
  presets: [preset(claude.run, fakeRun)],
  tags: [claude.config(config)],
  extensions: [captureTrace],
})

await ctx.exec({ flow: claude.turn, input })
expect(trace.edges).toContainEqual({ parent: "claude.complete", child: "claude.run" })
```

These examples must be adapted to the real error and trace contracts found by DKR-2. They are candidate delivery shapes, not assertions about current runtime output.

## False-positive and false-negative register

| Rule/read | False-positive class | False-negative class | Required handling |
| --- | --- | --- | --- |
| `config-via-tags` | Documented low-level handle constructors intentionally capture inputs. | Destructured params, aliases, helper forwarding. | Keep explicit constructor config; conformance owns provider required bindings. |
| `no-implicit-tag-read` | None found for resolvable direct identifier reads. | Imported/call-built deps, member/computed tag expressions, aliases. | Keep fail-open and document; missing-tag conformance closes the accepted provider contract. |
| `no-direct-flow-composition` | None found for the confirmed controller-child doctrine. | Imported/aliased/helper-built flow identity and indirect execution. | Scope substitution and trace conformance. |
| `no-module-mocks` | Global spy in an adapter atom's own test. | Mock APIs outside recognized Vitest/Jest imports and manual global mutation. | Refine or configure the exact adapter exception; never claim the current rule fully reads AG-11. |
| `no-scope-reach` | None found on product paths. | All test paths are exempt, including graph factories declared inside tests; aliases may escape direct detection. | Scope conformance and focused test-path fixture. |
| `no-shared-scope-factory` | None found for direct returned `createScope`. | Helper-routed, cross-function, re-exported, or collection-wrapped scopes. | External consumer/import assertion plus review of composition-root exports. |
| `no-handle-factory` | Documented low-level constructors unless configured. | Helper calls, assignments, collections, cross-function aliases. | Keep explicit constructor config and API assertion. |
| candidate explicit atom generic | None under current doctrine. | Re-exported aliases and wrappers. | Document and cover canonical imports. |
| candidate immediate return binding | None for the exact adjacent single-binding shape. | Destructuring, multiple declarations, aliases. | State the narrow invariant; do not claim general single-use analysis. |
| namespace/API assertion | Breaking a still-supported legacy export if migration was not approved. | Internal non-exported facade or indirect re-export not in the chosen API report. | Gate on DKR-2 plus human-approved compatibility decision; pair with conformance. |
| scope conformance | Over-specific error text or trace representation. | An untested binding/edge. | Table-drive every accepted required binding and child edge; assert stable semantic error kinds, not incidental prose. |

## Bounded candidate delivery paths

Candidate CKR: `CKR-L1 authoring_anti_goal_readable_count == 7`.

Candidate PKRs, not promoted until the orchestrator accepts this checkpoint:

1. `PKR-LINT-1`: add `no-explicit-atom-type-argument` and `no-immediate-return-binding`, each with canonical-import, alias/shadow, passing, failing, and deterministic-repeat fixtures plus documented false negatives.
2. `PKR-LINT-2`: refine `no-module-mocks` for the adapter atom's own global-fake exception without adding provider suppressions; add one valid adapter-global fixture and one invalid imported-module spy fixture.
3. `PKR-LINT-3`: add a touched-path JSON diagnostic gate that counts warnings and errors and scans provider/core/lint/tests/docs paths actually changed; do not widen into historical monorepo cleanup.
4. `PKR-API-1`: after DKR-2 acceptance, add exact Claude/Codex public export and type assertions for the chosen namespace contract.
5. `PKR-CONFORMANCE-1`: after DKR-2/DKR-3 acceptance, add table-driven missing-binding, scope substitution, public-entrypoint, cleanup, and trace-edge cases.

Do not fund a generic `related-handles-namespace`, `no-implicit-binding`, `no-facade-object`, `no-any`, `no-defensive-null`, or `no-wiring-type` parser rule from this checkpoint. Their semantic exceptions are not reliably visible to the current parser-only scanner. Exact provider API assertions or narrower future DKRs are the bounded route.

## Questions answered

- Existing lint already covers most common local escapes, but warning defaults and the root path list mean a green root lint exit is not a complete AG-8 read.
- Namespace alignment, implicit capability binding, and hidden runtime edges cannot be accepted from parser syntax alone.
- Two missing style rules have narrow, replayable AST invariants.
- The adapter atom unit-test exception conflicts with the current blanket `spyOn` diagnostic and must be resolved before AG-11 is called readable.
- All seven authoring walls can receive deterministic reads through a lint/API/conformance bundle without pretending subjective semantics are syntax.

## Questions unanswered

- DKR-2 must choose the exact namespace/export shape before AG-12 and the API portion of AG-14 can be implemented.
- DKR-3 must choose which engine, transport, auth, roots, permissions, and environment bindings are required before AG-10's table can be written.
- The real missing-dependency error kind and trace event contract must be read from the accepted shared session design before conformance fixtures are finalized.
- Human approval may be needed if grouping handles changes current flat public exports; this DKR cannot approve that compatibility change.

## Risk and anti-goal implications

- AG-L1: broad semantic rules are explicitly vetoed; only two narrow AST invariants are candidates.
- AG-L2/AG-L3: every candidate records valid/invalid shapes and known misses; the existing adapter-spy mismatch is surfaced instead of hidden.
- AG-L4/AG-L5: no suppression or broad cleanup is proposed. Changed-path enforcement is bounded to touched paths.
- AG-L6/AG-L7: every candidate rule requires paired fixtures and repeat-normalized diagnostics.
- AG-7/AG-INDEPENDENCE: this is a writer checkpoint candidate and cannot certify itself; deterministic replay and independent validation remain required.
- AG-LEVEL: CKR-L1 and all PKRs remain candidate-only until the orchestrator accepts the DKR checkpoint.

CKRs are measurable contribution context, not worker work.

DKRs are discovery-worker scopes; PKRs are progression-worker execution units; there is no CKR worker.
