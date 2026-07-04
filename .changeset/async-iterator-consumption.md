---
"@pumped-fn/lite": minor
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
