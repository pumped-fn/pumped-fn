# Build, test, and operate comparison

One account-onboarding contract runs through pumped-fn, Effect, Awilix, Inversify, and plain TypeScript. The homepage exposes the exact Build source, native substitution test, and operations proof for each lane.

The account domain and Effect composition start from Effect's official HTTP server example. `sources.lock.json` pins each external source and the browser-safe adaptation boundary.

The editor carries live type intelligence: a web worker hosts a TypeScript virtual environment seeded with the checked-in case files and the real `.d.ts` surface of every lane dependency, so hover, completion, and diagnostics reflect the same types the repository compiles against. The Sandpack preview runs three proofs — the lifecycle contract, a throughput benchmark executed on the visitor's machine, and a live `@pumped-fn/lite` reactivity demo.

## Verify

```sh
pnpm -F @pumped-fn/compare dev
pnpm -F @pumped-fn/compare test
pnpm -F @pumped-fn/compare typecheck
pnpm -F @pumped-fn/compare build
pnpm -F @pumped-fn/compare browser:smoke
```

The browser opens all fifteen checked-in Build, Test, and Operate proof files in an editable Sandpack workspace. Node and Chromium execute the unchanged three-request lifecycle contract.

## Source policy

- Competitor code follows the official service, layer, container, scope, lifetime, test, and disposal shapes named in `sources.lock.json`.
- All lanes satisfy the same black-box contract, but their internal file shape remains idiomatic.
- Operations wording describes the checked-in lane. It does not claim a product cannot be instrumented.
- `examples/invoice-triage` remains the canonical pumped-fn application. This package is a comparison and verification surface.

## Color policy

- Page chrome is grayscale, enforced by the authored and computed audits in `scripts/adapters/color-audit.mjs`.
- Syntax tokens inside the editor may use only the fixed palette declared as `editorSyntaxPalette` in the audit; `src/editor/code-theme.ts` must conform, and the computed audit exempts exactly those values on `sp-syntax-*` spans.
