# Comparison lab

This private package owns the guided comparison and its executable proof. One account-onboarding contract runs through pumped-fn, Effect, Awilix, Inversify, and plain TypeScript. Each lane owns dependency composition, request facts, typed duplicate handling, and database cleanup in its native style.

The account-creation domain and Effect service composition start from Effect's official HTTP server example rather than a pumped-fn example. `sources.lock.json` pins the upstream repositories, files, documentation, commits, package versions, and adaptation boundary.

## Verify

```sh
pnpm -F @pumped-fn/compare dev
pnpm -F @pumped-fn/compare test
pnpm -F @pumped-fn/compare typecheck
pnpm -F @pumped-fn/compare build
pnpm -F @pumped-fn/compare browser:smoke
```

The browser opens the exact checked-in lane and scenario files in an editable Sandpack workspace. Node and Chromium execute the same three-request lifecycle contract.

## Source policy

- Competitor code follows the official service, layer, container, scope, lifetime, and disposal shapes named in `sources.lock.json`.
- All lanes satisfy the same black-box contract, but their internal file shape remains idiomatic.
- Source provenance and executable results are shown separately. Passing the shared suite does not turn a subjective readability claim into a measured fact.
- `examples/invoice-triage` remains the canonical pumped-fn application. This package is a comparison and verification surface.
