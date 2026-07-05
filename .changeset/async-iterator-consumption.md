---
"@pumped-fn/lite": minor
"@pumped-fn/lite-extension-suspense": patch
---

Async-iterator consumption of the graph. `scope.changes(atom | selectHandle)` and
`ctx.changes(...)` iterate value changes conflated to latest, with
`{ states: true }` yielding state transitions and errors as data. Atoms whose
value is an async iterable get `scope.resolveStream(atom)` /
`ctx.resolveStream(atom)`: the scope drives the producer once and fans out
per-consumer conflating views, calls `iterator.return()` on dispose, release,
and invalidation (re-driving the new iterable into the same views), and never
lets a slow or absent consumer block the producer. `scope.drain(atom, { take })`
collects a view into an array. Context-bound iteration ends at `ctx.close()`;
scope-level iteration ends at `scope.dispose()`; abandoning an iterator
detaches only that view.

Generator flows: a flow factory that is an async generator yields elements and
returns a final output. `ctx.exec` drains to the output unchanged;
`ctx.execStream` returns the yields as an `AsyncIterable` plus a `result`
promise. The consumer pulls directly (inherent backpressure, no drops), each
invocation is consumed once, and breaking out cancels the invocation — the
generator's `finally` runs and `onClose` observes `{ ok: false, aborted: true }`.
Streaming invocations are marked on the exec target for extensions; the
suspense extension refuses to replay them until stream journaling exists.
Flow handles gain `execStream(...)` so streaming composition is deps-declared:
`deps.child.execStream(input)` + `yield*` + `await stream.result`.
