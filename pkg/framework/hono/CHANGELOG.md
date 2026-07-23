# @pumped-fn/lite-hono

## 0.2.2

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.

## 0.2.1

### Patch Changes

- 6d1765e: Adapters honor close-settlement semantics: the hono middleware closes the
  request context with `ok: false` when hono handled a route error
  (`context.error`), so boundary resources settle in the failure direction
  instead of committing on failed requests; lite-react's managed-context
  teardown reports settlement failures instead of leaking an unhandled
  rejection.

## 0.2.0

### Minor Changes

- ab0d4ba: Add first-class framework-lane adapters for Hono and TanStack Start with request-scoped Lite execution contexts, namespace-scoped public handles, extension-bound integration methods, docs, runtime tests, type-contract checks, and stress integration guardrails.

## 0.1.0

- Add Hono middleware and request helper primitives for per-request Lite execution contexts.
