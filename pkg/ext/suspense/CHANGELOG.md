# @pumped-fn/lite-extension-suspense

## 2.0.0

### Patch Changes

- Updated dependencies [174cd70]
  - @pumped-fn/lite@4.0.0

## 1.1.1

### Patch Changes

- 90854f7: Async-iterator consumption of the graph. `scope.changes(atom | selectHandle)` and
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

  `bound(dep)` curries the executing invocation's context into ctx-first
  functions (or objects of them) resolved from tags, atoms, or resources —
  `deps: { model: bound(tags.required(model)) }` then `model.complete(request)`.
  ctx is a receiver, never an argument; the new lint rule
  `pumped/no-ctx-argument` enforces it.

## 1.1.0

### Minor Changes

- fb8329c: Ship the agent workflow surface over lite primitives.

  Adds concise agent authoring helpers, workflow-backed turns, skills, tools, subagents, sessions, run inspection, Fetch request adapters, eval summaries, in-memory test runtime helpers, isolated Codex/Claude CLI model harnesses, lazy Codex/Claude provider packages, and a lazy just-bash sandbox provider package.

## 1.0.0

### Major Changes

- b366df0: Add tag-first agent workflow helpers and tighten context tag handling across lite primitives.

  Move serializability policy out of lite core, remove the experimental primitive `use` surface, make `workflowRun()` a composable workflow tag, expose workflow and agent runtime contracts as required tags, and split workflow replay/logging from agent remote routing.

  Preserve exec extension async error semantics, make the lite CLI bin install-safe before build, and suppress the lite-hmr CJS import.meta build warning.

  Upgrade the repo build/test toolchain for the Vite 8 ecosystem, remove the stale docs site generation path, and refresh affected package build metadata.

  Remove the unmaintained `@pumped-fn/lite-devtools-server` package.

  Breaking extension note: `wrapExec` now wraps dependency resolution as well as factories so extensions can install tags before deps resolve. `ResolveEvent` now carries atom resolve context and resource context shapes explicitly.
