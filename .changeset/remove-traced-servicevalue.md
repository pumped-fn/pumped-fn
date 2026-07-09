---
"@pumped-fn/lite": major
"@pumped-fn/lite-lint": major
---

Remove the ctx-aware-records primitive family from `@pumped-fn/lite`

The `traced()` and `serviceValue()` helpers (deprecated in 3.6.0), the `service()`
atom constructor, and the `ServiceMethod`/`ServiceMethods`/`ServiceValue`/`Serviced`/
`Traced`/`TracedDep` types are removed, along with their symbols
(`tracedDepSymbol`, `serviceValueSymbol`) and the `pumped/no-traced-service-value`
and `pumped/no-traced-handle-escape` lint rules.

The one-way surface is now `atom`, `resource`, `flow`, `tag`, `controller`, plus
`ctx.exec({ fn })` for instrumenting a specific or foreign call. Both removed helpers
were only loops that emitted `ctx.exec({ fn })` per record member, and they duplicated
each other.

Migration:

- Replace a `traced(atom)` dep plus `handle.member.exec(...)` calls with an adapter
  atom dep and `ctx.exec({ fn: () => client.member(args), name: "client.member", tags })`
  at each use site.
- Replace a `serviceValue` record closed over a runtime value with flows that depend on
  that value's atom/tag and act on it directly.
