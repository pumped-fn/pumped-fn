---
"@pumped-fn/lite": minor
"@pumped-fn/lite-lint": minor
---

Deprecate `traced()` and `serviceValue()`. Both are only loops that emit `ctx.exec({ fn })` per record member, and they duplicate each other (foreign vs first-party records) — so they are a second and third way to do what `ctx.exec({ fn })` already does.

The one way going forward:
- **`flow`** for a capability that is a graph node (deps, factory, substitutable via tag).
- **`ctx.exec({ fn })`** to instrument a specific/foreign call as a named, tag-able edge.

Foreign integration is an adapter atom (the substitution seam) plus `ctx.exec({ fn: () => client.method(args), name: "client.method", tags })` — this handles class-instance SDKs (which `traced()` could not, since it only enumerates own-enumerable functions), keeps the boundary narrow, and preserves the receiver via ordinary method-call syntax. A record closed over a runtime value is expressed as flows that dep that value's atom/tag and act on it directly; the invoice-triage example replaced its `serviceValue` store with plain flows over the database atom.

Both functions still work in this release; removal is planned for the next major. Migration: replace `traced(clientAtom)` deps + `client.method.exec(args)` with the client atom + `ctx.exec({ fn })`; replace a `serviceValue` record with flows.

A new `@pumped-fn/lite-lint` rule, `pumped/no-traced-service-value` (error severity), enforces this doctrine by flagging any call to the `traced` or `serviceValue` imports outside the defining `pkg/core/lite/` package.
