---
"@pumped-fn/lite": major
"@pumped-fn/lite-devtools": major
---

feat(lite): add `resource()` execution-scoped dependency primitive

BREAKING CHANGE: `wrapResolve` extension hook signature changed from `(next, atom, scope)` to `(next, event: ResolveEvent)` where `ResolveEvent` is a discriminated union (`{ kind: "atom" }` or `{ kind: "resource" }`).

New `resource({ deps, factory })` primitive for execution-level dependencies (logger, transaction, trace span). Resources are resolved fresh per execution chain, shared via seek-up within nested execs, and cleaned up with `ctx.onClose()`.

Migration: update `wrapResolve(next, atom, scope)` → `wrapResolve(next, event)`, dispatch on `event.kind`.
