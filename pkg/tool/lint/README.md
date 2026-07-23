# @pumped-fn/lite-lint

Static anti-pattern scanner for `@pumped-fn/lite` and `@pumped-fn/lite-react` codebases.

It is lint-like, but intentionally small: it uses the TypeScript parser directly and checks the boundary
rules that the lite and lite-react docs teach. The CLI exits nonzero when diagnostics are found.

The rules encode the [code review guide](../../../docs/code-review-guide.md).

## Usage

```sh
pumped-lite-lint src tests
pumped-lite-lint --json src tests
pumped-lite-lint --config pumped-lite-lint.json src tests
```

> **Note:** In this repo, root `pnpm lint` builds the tool and scans the public docs plus practical examples.

## Rules

| Rule | What it rejects |
| --- | --- |
| `pumped/no-module-mocks` | `vi.mock`, `jest.mock`, and `vi.spyOn`; use scope presets at the test seam. |
| `pumped/no-jsdom-backend` | Browser-emulator test markers and DOM-suffixed observer tests; rendered observer tests use Vitest Browser Mode. |
| `pumped/no-test-only-branches` | Product branches keyed on test mode; use presets instead. |
| `pumped/no-definition-handle-suffix` | `fooAtom`, `runFlow`, `txResource`, `requestTag`; rely on inference. |
| `pumped/no-explicit-atom-type-argument` | Explicit type arguments on `atom<T>(...)`; let the atom infer its value and type substitutes with `satisfies` and `Lite.Utils.AtomValue`. Direct, aliased, and namespace imports from `@pumped-fn/lite` are recognized. Known syntactic false negatives: re-exported aliases and wrapper functions. |
| `pumped/no-immediate-return-binding` (warn) | A block-local identifier with an initializer returned unchanged by the immediately following statement when that return is its only same-named reference in the block; inline the expression. Known conservative false negatives: destructuring, multi-declaration statements, aliases, and any other same-spelled identifier in the block. |
| `pumped/no-direct-flow-composition` | Flows calling child flows with hidden `ctx.exec({ flow })` or raw same-file flow deps; use `controller(childFlow)` deps. |
| `pumped/no-ctx-argument` | Factory context parameters passed as call arguments or embedded directly in object/array literals/spreads; `ctx` is a receiver, and ctx-taking contracts should be reified as a flow reached via deps. Direct parameter tracking only in v1; aliases are not followed. |
| `pumped/no-shared-scope-factory` | Helpers that return preconfigured `createScope(...)`; each use site should own tags, presets, and extensions. |
| `pumped/no-scope-argument` | Exported product helpers accepting `scope`; composition roots and tests own scope. |
| `pumped/no-scope-reach` | Atom/flow/resource factories reaching `ctx.scope` or calling `.createContext(...)`; execution contexts are owned by composition roots. |
| `pumped/no-render-outside-browser-test` | Testing Library `render` outside `*.browser.test.tsx`; DOM observer tests run in browser mode. |
| `pumped/no-ambient-io-outside-boundary` | Raw `fetch`, timers, DOM/storage, random, and clock access outside transport/root declarations. |
| `pumped/no-react-use-scope` | Feature components calling `useScope`; use graph hooks and `useFlow`. |
| `pumped/no-react-use-execution-context` | Feature components calling `useExecutionContext`; use `useFlow` for UI-triggered flows. |
| `pumped/no-react-local-state` | Feature components mirroring graph-owned state with `useState`. |
| `pumped/no-react-manual-execution-context` | Feature components creating or closing execution contexts manually. |
| `pumped/no-internal-example-label` | Stale internal example vocabulary in public docs/source. |
| `pumped/no-implicit-tag-read` (warn) | `ctx.data.seekTag`/`getTag` reads for a tag not declared in the unit's `deps` (via `tags.required`/`tags.optional`/`tags.all`), and `scope.resolve(...)` calls inside factory bodies; declare the dependency instead. |
| `pumped/no-naked-globals` (warn) | `Date.now()`, `new Date()`, `Math.random()`, `process.env`, `fetch`, `setTimeout`/`setInterval`, and `fs`/`child_process`/`node:*` builtin usage inside atom/flow/resource factory bodies; wrap the global in an adapter atom/resource or a tag. |
| `pumped/no-module-state` (warn) | Module-level `let` declarations, and module-level mutable object/array/Map/Set literals that are exported unfrozen or closed over by a factory, in files that also define atom/flow/resource units. |
| `pumped/prefer-destructured-deps` (warn) | Atom/flow/resource/tag factories whose second (deps) parameter is a plain identifier read via member access (e.g. `deps.store`); destructure it in the signature instead (`factory: (ctx, { store }) => ...`). |
| `pumped/no-untyped-throw` (warn) | `throw new Error(...)` and other builtin error constructors (`TypeError`, `RangeError`, etc.) inside atom/flow/resource factories; throw a domain error class carrying structured fields (kind/op/entity) so traces and edges can discriminate planned vs unplanned failures. Rethrow of a caught identifier (`throw error`) and user-defined error classes both pass. |
| `pumped/no-swallowed-error` (warn) | Catch clauses inside atom/flow/resource factories that neither rethrow nor reference the caught error (empty catch bodies, `catch {}` with no throw, or bodies that discard the binding); swallowing the error here blinds the trace seam. Wrapping with a cause (`throw new StoreError(msg, error)`), rethrowing, or passing the error to a dep (e.g. logging) all pass. |
| `pumped/no-handle-spread` (warn) | Object literals that spread a lite handle (`{ ...sharedFlow, tags: [...] }`), detected conservatively — the spread identifier is a same-file `atom`/`flow`/`resource`/... creator result, or the object literal also sets a `tags` property alongside any spread (the retrofit fingerprint); spreads fork node identity and silently miss presets targeting the original. Wrap the shared flow in a thin entry flow (`deps: { run: controller(sharedFlow) }`, `factory: (ctx, { run }) => run.exec(...)`) instead. Plain data object spreads are not flagged. |
| `pumped/no-hidden-exec-params` | Inline `ctx.exec({ fn, params })` functions that use flow execution input without recording it in `params`. Pass the real arguments through `params` so extensions can observe the operation. Keep sensitive values there; use logging and observable runtime tags to omit or redact their telemetry. Empty `params` is only for true zero-input work. Syntactic scope: direct `ctx.exec`, inline functions, direct local/context captures, immutable `const` aliases of context access paths, and array-literal `params`. Dynamic computed member reads require their ancestor object in `params`; separately evaluated keys are not assumed equal. Referenced functions, transformed or mutable aliases, and computed parameter arrays are not followed. |
| `pumped/no-handle-factory` | Exported function declarations and exported arrow/function expressions that directly return an `atom`/`flow`/`resource`/`material`/`tag`, return one through a wrapper such as `model(...)`, or return a same-function local handle. Configure documented core constructors with `allowHandleFactories`; composition roots remain unrestricted because they return scopes, not handles. Known syntactic false negatives: handles routed through helper calls, assignments, collections, or cross-function aliases. |
| `pumped/config-via-tags` (warn) | A graph factory that reads a direct identifier parameter from its enclosing function. Provider configuration belongs in a module-level tag declared through `deps`. Configure documented low-level constructors with `allowHandleFactories`. Known syntactic false negatives: destructured parameters, aliases, and values forwarded through helpers. |
| `pumped/no-unattributed-await` | Inside an atom/flow/resource factory, an awaited (or `.then()`-chained) call rooted at the factory's deps parameter, unless it's graph machinery (`exec`/`execStream`/`prepare` by method name; `resolve` only when the dep's initializer is a `controller(...)` call) or the enclosing flow's `tags` array carries a `step(...)` tag imported from `@pumped-fn/sdk`; awaited foreign calls only happen inside declared spans. `for await` iteration and sync calls on deps are not flagged, and a nested function parameter that shadows the deps binding name is respected. Known false negatives, accepted for a syntactic rule: `exec`/`execStream`/`prepare` name collisions on non-handle deps, aliased bindings, rest/nested deps patterns, spread-built tags arrays, and un-awaited returned promises. |

The default path walk skips `before.*` example files, generated output, lockfiles, and dependency
directories where examples intentionally contain bad shapes or third-party code.

## Severity

Every diagnostic carries a `severity` of `"error"` or `"warn"`.

> **Note:** The CLI exits nonzero only when at least one `"error"` diagnostic is found. `"warn"` diagnostics still print and appear in `--json`, but they do not fail the process; `pumped/config-via-tags`, `pumped/no-implicit-tag-read`, `pumped/no-naked-globals`, `pumped/no-module-state`, `pumped/prefer-destructured-deps`, `pumped/no-untyped-throw`, `pumped/no-swallowed-error`, `pumped/no-handle-spread`, and `pumped/no-immediate-return-binding` default to `"warn"` as an incremental cleanup inventory, while all other rules default to `"error"`.

## Config

The API accepts `rules` and `compositionPaths`. The CLI reads the same options from the JSON file
passed to `--config`, alongside `maxWarnings`:

```json
{
  "compositionPaths": ["(?:^|/)(?:probe-[^/]+|smoke-edge)\\.[cm]?[jt]s$"],
  "maxWarnings": 0
}
```

Each `compositionPaths` entry is a JavaScript regular-expression source string tested against the
normalized absolute file path. A match extends the built-in composition-root filename convention. It allows
ambient IO, naked globals, scope factories, scope arguments with the existing glue diagnostic, and
unattributed awaits on that path. Other rules still apply. Use it to classify a project-specific
composition or acceptance root, not to suppress individual lines.

`rules` configures per-rule allowlists:

```ts
import { scanPaths } from "@pumped-fn/lite-lint"

const result = await scanPaths(["src", "tests"], {
  rules: {
    "pumped/no-implicit-tag-read": { allowImplicit: ["requestId"] },
    "pumped/no-naked-globals": { allowGlobals: ["fetch"] },
    "pumped/no-handle-factory": { allowHandleFactories: ["cliWorker"] },
  },
})
```

`allowImplicit` lists tag identifier names that may be read without being declared in `deps`.
`allowGlobals` lists global names (e.g. `"Date.now"`, `"Math.random"`, `"process.env"`, `"fetch"`,
`"setTimeout"`, `"setInterval"`, or a builtin module specifier like `"node:fs"`) that are exempt from
`no-naked-globals`; it is merged with a small built-in allowlist of already-safe statics
(`JSON`, `Math`, `Object`, `Array`, `String`, `Number`, `structuredClone`, `URL`).
`allowBuiltins` lists builtin error constructor names (e.g. `"TypeError"`) that are exempt from
`no-untyped-throw`; empty by default.
`allowHandleFactories` lists documented low-level constructors such as `agent`, `tool`, `skill`,
`sub`, `session`, `guard`, `material`, `channel`, `schedule`, or `cliWorker`. Use the same list for
`no-handle-factory` and `config-via-tags` when a constructor intentionally captures its inputs.

## API

```ts
import { scanPaths, scanText } from "@pumped-fn/lite-lint"

const result = await scanPaths(["src", "tests"])
const diagnostics = scanText(source, "src/file.ts")
```

## Next

- [Code review guide](../../../docs/code-review-guide.md)
- [pumped-fn README](../../../README.md)

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
