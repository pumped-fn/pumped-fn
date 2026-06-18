# Complex Kanban React Stress Slice

This slice is a realistic board workspace stress case, not a Kanban helper API. The product code uses the
public primitives directly:

- Map-backed graph state holds projects, users, cards, and per-project lane arrays.
- `boardView` derives lane cards, blocked status, WIP warnings, workload pressure, and recent audit output.
- Tags carry workspace, active project, actor, and nested editing-card identity; the editing-card tag is
  object-valued with `eq` so recreated provider tag values keep the same editor boundary when the card id is
  unchanged.
- Tests use `createScope({ presets, tags, extensions })` as the seam; no module mocks or product test branches.
- `boardSession` is a boundary-owned resource for UI execution identity.
- `actionAudit` is a current-owned resource shared by nested `ctx.exec()` children inside one action.
- `cardDraft` is a scoped value under nested `ExecutionContextProvider` boundaries, so sibling card editors do
  not share draft state.
- React components observe through `useAtom`, `useSelect`, `useResource`, `useScopedValue`, and
  `useExecutionContext`; they dispatch flows and do not create or close contexts manually.

## Why This Exists

The existing dashboard capstone proves frontend boundary doctrine on service-health data. This slice pushes
state density: map lookups, ordered arrays, subdata projections, multiple derived reactions, nested UI
execution, action-scoped audit, and form drafts living in the graph instead of React component state.
