---
"@pumped-fn/lite": minor
"@pumped-fn/lite-lint": minor
---

`traced()`: a capability record (a plain record of async functions over a foreign
API, held in an atom) consumed through `traced(queries)` projects each member to
a handle — `store.settleImport.exec({ params, tags })` — that routes through the
exec pipeline as a named edge (`depKey.member`) with per-invocation attribution
and per-call tags. Types are identity-preserving; the runtime contract is strict:
non-function members and memberless records (class instances) reject at
resolution. This is the transport-capability complement to port flows: business
features stay flows, foreign-API call sites become visible, spannable graph
edges.

lite-lint: `pumped/no-unattributed-await` exempts deps initialized with the lite
`traced()` (attributed by construction) and its `resolve` exemption requires a
lite `controller()` initializer; both exemptions are shadow-aware — local
declarations, function/class names, binding-pattern parameters, catch bindings,
and loop-initializer bindings that shadow the lite imports disqualify the
exemption.
