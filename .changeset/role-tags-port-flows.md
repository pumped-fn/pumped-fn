---
"@pumped-fn/lite": minor
"@pumped-fn/sdk": major
"@pumped-fn/sdk-claude": major
"@pumped-fn/sdk-codex": major
"@pumped-fn/sdk-test": minor
"@pumped-fn/lite-lint": minor
---

Role tags and port flows. A tag can carry a flow; in deps position it projects
to a context-bound `FlowHandle` (`tags.optional` yields handle-or-undefined,
`tags.all` an array of handles), mirroring the bare-flow-dep rule. The sdk
`Model` contract is now `Lite.Flow<ModelResponse, ModelRequest>`: implementors
are graph nodes selected via the `model` tag, and the new `complete` port flow
owns the `kind: "llm"` step span once for every consumer. `bound()` is removed
from lite — value-level ctx currying is replaced by graph-native composition
(it never shipped in a published release). `@pumped-fn/sdk-claude` /
`@pumped-fn/sdk-codex` validate harness configuration eagerly at binding.
`@pumped-fn/sdk-test` gains `modelStub` to lift a plain responder into an
implementor flow. lite-lint gains `pumped/no-unattributed-await` (awaited
foreign calls must sit inside a step-tagged flow or go through a port flow)
and the `no-ctx-argument` remedy now points at port flows.

Also fixes lost controller writes: `set`/`update` on a resolved atom now apply
immediately even while an invalidation chain is active (previously they were
deferred into a single pending slot — concurrent `update` callbacks were
silently dropped and capture-inside-updater read stale state whenever a
`watch: true` derived atom was subscribed). Updates queued during `resolving`
now compose instead of overwriting.
