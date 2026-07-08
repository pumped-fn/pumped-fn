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

`traced()` deps are execution-position only: a resource dep would capture the
owning boundary's context instead of the calling invocation's (misattribution),
so it is rejected at the type level and at resolution.

lite-lint: new `pumped/no-traced-handle-escape` — traced handles are one-depth
exec edges; aliasing, passing, returning, spreading, or deep-chaining them loses
execution-time attribution and is an error. `pumped/no-unattributed-await` exempts deps initialized with the lite
`traced()` (attributed by construction) and its `resolve` exemption requires a
lite `controller()` initializer; both exemptions are shadow-aware — local
declarations, function/class names, binding-pattern parameters, catch bindings,
and loop-initializer bindings that shadow the lite imports disqualify the
exemption.

Close must not lie: `ctx.close({ ok: true })` now rejects when a registered
settlement callback (onClose/cleanup, including resource teardown) throws —
the error propagates through the enclosing `exec` like any other failure. A
failed close still swallows secondary teardown errors so the primary error is
never masked. This makes transaction-boundary middleware sound: a failed
commit rejects the owning execution instead of vanishing.
