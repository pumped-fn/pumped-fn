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
| `pumped/no-module-mocks` | `vi.mock` / `jest.mock`; use scope presets at the test seam. |
| `pumped/no-jsdom-backend` | Browser-emulator test markers and DOM-suffixed observer tests; rendered observer tests use Vitest Browser Mode. |
| `pumped/no-test-only-branches` | Product branches keyed on test mode; use presets instead. |
| `pumped/no-definition-handle-suffix` | `fooAtom`, `runFlow`, `txResource`, `requestTag`; rely on inference. |
| `pumped/no-scope-argument` | Exported product helpers accepting `scope`; composition roots and tests own scope. |
| `pumped/no-ambient-io-outside-boundary` | Raw `fetch`, timers, DOM/storage, random, and clock access outside transport/root declarations. |
| `pumped/no-react-use-scope` | Feature components calling `useScope`; use graph hooks and `useExecutionContext`. |
| `pumped/no-react-local-state` | Feature components mirroring graph-owned state with `useState`. |
| `pumped/no-react-manual-execution-context` | Feature components creating or closing execution contexts manually. |
| `pumped/no-internal-example-label` | Stale internal example vocabulary in public docs/source. |

The default path walk skips `before.*` example files, generated output, lockfiles, and dependency
directories where examples intentionally contain bad shapes or third-party code.

## API

```ts
import { scanPaths, scanText } from "@pumped-fn/lite-lint"

const result = await scanPaths(["src", "tests"])
const diagnostics = scanText(source, "src/file.ts")
```
