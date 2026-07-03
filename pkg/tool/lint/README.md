# @pumped-fn/lite-lint

Static anti-pattern scanner for `@pumped-fn/lite` and `@pumped-fn/lite-react` codebases.

It is lint-like, but intentionally small: it uses the TypeScript parser directly and checks the boundary
rules that the lite and lite-react docs teach. The CLI exits nonzero when diagnostics are found.

## Usage

```sh
pumped-lite-lint src tests
pumped-lite-lint --json src tests
```

In this monorepo, root `pnpm lint` builds the tool and scans the public docs plus practical examples:

```sh
pnpm lint
```

## Rules

| Rule | What it rejects |
| --- | --- |
| `pumped/no-module-mocks` | `vi.mock`, `jest.mock`, and `vi.spyOn`; use scope presets at the test seam. |
| `pumped/no-jsdom-backend` | Browser-emulator test markers and DOM-suffixed observer tests; rendered observer tests use Vitest Browser Mode. |
| `pumped/no-test-only-branches` | Product branches keyed on test mode; use presets instead. |
| `pumped/no-definition-handle-suffix` | `fooAtom`, `runFlow`, `txResource`, `requestTag`; rely on inference. |
| `pumped/no-direct-flow-composition` | Flows calling child flows with hidden `ctx.exec({ flow })` or raw same-file flow deps; use `controller(childFlow)` deps. |
| `pumped/no-shared-scope-factory` | Helpers that return preconfigured `createScope(...)`; each use site should own tags, presets, and extensions. |
| `pumped/no-scope-argument` | Exported product helpers accepting `scope`; composition roots and tests own scope. |
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

The default path walk skips `before.*` example files, generated output, lockfiles, and dependency
directories where examples intentionally contain bad shapes or third-party code.

## Severity

Every diagnostic carries a `severity` of `"error"` or `"warn"`. The CLI exits nonzero only when at
least one `"error"` diagnostic is found; `"warn"` diagnostics still print (and show up in `--json`
output) but never fail the process. `pumped/no-implicit-tag-read`, `pumped/no-naked-globals`,
`pumped/no-module-state`, and `pumped/prefer-destructured-deps` default to `"warn"` because root `pnpm lint` only scans docs and the
practical example packages today (not the whole monorepo), and turning them into hard failures for
every existing example in one pass isn't the goal of adding them — treat their output as an
inventory to clean up incrementally. All other rules default to `"error"`, matching current
behavior.

## Config

`scanPaths`/`scanText` accept an optional `rules` object to configure per-rule allowlists:

```ts
import { scanPaths } from "@pumped-fn/lite-lint"

const result = await scanPaths(["src", "tests"], {
  rules: {
    "pumped/no-implicit-tag-read": { allowImplicit: ["requestId"] },
    "pumped/no-naked-globals": { allowGlobals: ["fetch"] },
  },
})
```

`allowImplicit` lists tag identifier names that may be read without being declared in `deps`.
`allowGlobals` lists global names (e.g. `"Date.now"`, `"Math.random"`, `"process.env"`, `"fetch"`,
`"setTimeout"`, `"setInterval"`, or a builtin module specifier like `"node:fs"`) that are exempt from
`no-naked-globals`; it is merged with a small built-in allowlist of already-safe statics
(`JSON`, `Math`, `Object`, `Array`, `String`, `Number`, `structuredClone`, `URL`).

## API

```ts
import { scanPaths, scanText } from "@pumped-fn/lite-lint"

const result = await scanPaths(["src", "tests"])
const diagnostics = scanText(source, "src/file.ts")
```
