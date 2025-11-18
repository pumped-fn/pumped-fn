# Execution Runtime Compaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse Flow runtime helpers into the ExecutionContext module and slim flow.ts down to pure definition/validation logic, leaving only two runtime files (execution-context.ts and scope.ts).

**Architecture:** Move exec/journal/parallel helpers fully into execution-context.ts, turning flow.ts into a lightweight factory exporting `flow`, `flowMeta`, and type utilities. ExecutionContextImpl exposes factory helpers for FlowDefinition, so scope imports only execution-context.ts. Update docs/tests to reflect reduced structure.

**Tech Stack:** TypeScript, pnpm, Vitest.

### Task 1: Ensure Flow definition helpers can live in execution-context

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Modify: `packages/next/src/flow.ts`

**Steps:**
1. Introduce a FlowDefinition builder in execution-context.ts (`createFlowDefinition` + types) so flow.ts can import and re-export without duplicating metadata wiring.
2. Move shared helpers (isDefineConfig, attachDependencies, etc.) into execution-context.ts or a local helper section exported for flow.ts consumption.
3. Keep flow.ts referencing only exported helpers + type definitions; remove direct imports of journaling/timeouts.
4. Run `pnpm -F @pumped-fn/core-next typecheck` to verify compile errors that highlight remaining dependencies.

### Task 2: Slim flow.ts to definition wrapper only

**Files:**
- Modify: `packages/next/src/flow.ts`

**Steps:**
1. Remove executor/journal logic now in execution-context.ts, leaving `flow()` implemented by delegating to the helper from Task 1.
2. Ensure `flow.execute` still works by re-exporting the execution helpers from execution-context.ts (e.g., `executeFlow`), so type definitions continue to resolve.
3. Delete now-unused imports (Promised, abort helpers, etc.).
4. Run `pnpm -F @pumped-fn/core-next typecheck` and fix remaining references.

### Task 3: Update scope.ts to rely solely on execution-context exports

**Files:**
- Modify: `packages/next/src/scope.ts`

**Steps:**
1. Replace `flowApi` usage with minimal adapter from execution-context (e.g., `resolveFlowHandler`).
2. Eliminate any Flow-specific helpers still imported, cross-check for duplicates.
3. Verify `scope.ts` only imports `flow` for public API and `flowDefinitionMeta`/`ExecutionContextImpl`.
4. Typecheck to confirm no stray references remain.

### Task 4: Clean up exports/docs/tests

**Files:**
- Modify: `packages/next/src/index.ts`
- Modify: `README.md`, `docs/index.md`
- Modify: `.claude/skills/pumped-design/references/*.md`
- Modify: `packages/next/CHANGELOG.md`

**Steps:**
1. Update index exports so runtime constants come from execution-context.ts only.
2. Describe the new file layout (Flow now “definitions only”) in docs and skills.
3. Add changelog entry noting runtime consolidation.

### Task 5: Verification

**Steps:**
1. `pnpm -F @pumped-fn/core-next typecheck`
2. `pnpm -F @pumped-fn/core-next typecheck:full`
3. `pnpm -F @pumped-fn/core-next test`
4. `pnpm -F @pumped-fn/examples typecheck`
