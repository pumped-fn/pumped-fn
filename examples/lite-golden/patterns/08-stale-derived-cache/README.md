# 08 - Stale Derived Cache
## Smell
Derived snapshots are held behind manual freshness flags and recomputed only when every mutating path remembers to mark the cache stale.
## Harm
Forgotten invalidation returns stale data, while coarse invalidation rebuilds derived work even when the visible value did not meaningfully change.
## Provenance
- microsoft/vscode, `src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts`, https://github.com/microsoft/vscode/blob/847d56902800ee60ff5078699ffac3e9fd0a3026/src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts#L179, MIT: a cached session snapshot is guarded by a manual dirty flag that save/change paths must keep in sync.
- anomalyco/opencode, `packages/tui/src/component/bg-pulse-render.ts`, https://github.com/anomalyco/opencode/blob/318dbe93ba9293708873a308729e02ec18707812/packages/tui/src/component/bg-pulse-render.ts#L138, MIT: background rendering caches frames and invalidates the frame cache manually when color or geometry inputs change.
## Transformation
`before.ts` stores a derived snapshot and a freshness flag. `after.ts` defines source atoms and derived atoms with `controller(source, { resolve: true, watch: true })`; lite owns subscription cleanup, equality gating, invalidation, and `scope.flush()` drains cascades deterministically.
## Lens coverage
inside-out and effect-managed are present. outside-in is absent because this pattern is scope-internal reactivity; the capstone metrics path covers the composed request-level use.
## Why 100% is natural
The meaningful branches are equality outcomes and retry failure recovery. Tests cover changed values, shallow-equal plain objects, `Object.is` behavior for `Date`, custom version equality, a three-step cascade, released derived atoms, and failed-resolve retry without duplicate listeners using a counting custom equality function.
