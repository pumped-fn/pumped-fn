# Framework Lane

`pkg/framework/` owns integrations for web and full-stack frameworks. A framework package may know
about a framework's request context, middleware, route handler, or server-function API, but it does
not own application scope construction.

## Package Rules

Framework packages use `@pumped-fn/lite-<framework>` npm names and short directory handles. The
adapter installs through `createScope({ extensions })`, then passes request-local execution contexts
through framework-native context surfaces.

Extension-like package roots export a contextual namespace value such as `hono` or `tanstackStart`.
Public handles under that namespace stay succinct because the namespace carries the framework
context. Prefer names like `adapter`, `middleware`, `request`, `call`, and `handler` under the
namespace over top-level destructurable handles that either lose context or repeat the package role.

Do not add shared scope factories, global registries, or framework-shaped copies of Lite primitives.
Users keep importing atoms, flows, resources, tags, presets, and `createScope` from `@pumped-fn/lite`.
Do not add public helpers that accept Lite `scope` or execution `context` parameters.
Framework-provided tags consumed by flows should use `tags.required(...)` so analysis can see the
dependency contract explicitly.
Any application unit that consumes external framework values is valid only when those values are
declared through `deps`; do not read framework request, response, or ambient execution data inside
the unit body.
Each framework package keeps a stress integration test that demonstrates realistic framework use and
cross-checks these anti-patterns.

## Current Packages

| Package | Role |
| --- | --- |
| `hono/` | Hono middleware plus request helpers. |
| `tanstack-start/` | TanStack Start request/function middleware, server-function flow helpers, and Vite boundary guard. |
