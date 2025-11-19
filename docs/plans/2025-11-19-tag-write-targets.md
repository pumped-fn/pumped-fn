# Tag Write Targets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split Tag writing APIs into explicit helpers per target (store, container, tagged array) and clear caches so container writes are immediately readable.

**Architecture:** Replace the overloaded `writeTo` alias with three explicit methods: `writeToStore`, `writeToContainer`, `writeToTags`. Each validates via existing helpers, mutates the correct structure, and invalidates the per-source cache. ExecutionContext only touches the store helper to keep semantics tight. Tests demonstrate each helper plus cache invalidation.

**Tech Stack:** TypeScript, pnpm, Vitest, pumped-fn tagging utilities.

### Task 1: Update Tag type definitions

**Files:**
- Modify: `packages/next/src/tag-types.ts:1-80`

**Step 1: Write failing type tests (implicit)**

Add interface entries for the new helpers, removing the old overloaded `writeTo`. Ensure `injectTo` remains for backwards compatibility but marked for store only.

```ts
writeToStore(target: Store, value: T): void
writeToContainer(target: Container, value: T): Tagged<T>
writeToTags(target: Tagged[], value: T): Tagged<T>
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`  
Expected: FAIL (implementations missing).

### Task 2: Implement helpers + cache invalidation

**Files:**
- Modify: `packages/next/src/tag.ts:1-320`
- Modify: `packages/next/tests/extensions.behavior.test.ts`

**Step 1: Write failing behavior tests**

Enhance `packages/next/tests/extensions.behavior.test.ts` with new sections:

```ts
it("writes to store via writeToStore", () => { /* expect extractFrom to read new value */ })
it("appends to container via writeToContainer and invalidates cache", () => { /* read before/after */ })
it("appends to tagged arrays via writeToTags and invalidates cache", () => { /* use Tag.collectFrom */ })
```

Include a test that calls `numberTag.collectFrom(container)` before writing, then writes using the new helper, then reads again to prove the cache updated. Run: `pnpm vitest packages/next/tests/extensions.behavior.test.ts` → Expected FAIL.

**Step 2: Implement helper methods**

- Introduce `writeToStore`, `writeToContainer`, `writeToTags` methods on `TagImpl`.
- Ensure `Tag.Tagged[]` writes push onto the provided array and return the tagged object.
- Call a new `invalidateCache(source)` helper after mutating containers/arrays; for stores, just set values.
- Keep `injectTo` but point it to `writeToStore` for compatibility.
- Remove the previous overloaded `set` signature.
- Update the `tag()` factory to expose the new methods (`fn.writeToStore = impl.writeToStore.bind(impl)` etc.) and delete the old `writeTo`.

**Step 3: Clear caches**

Add `tagCacheMap.delete(source)` inside helpers whenever the source is a container or array so `extractFrom` rebuilds fresh caches.

**Step 4: Verify tests**

Run: `pnpm vitest packages/next/tests/extensions.behavior.test.ts`

**Step 5: Commit**

```bash
git add packages/next/src/tag-types.ts packages/next/src/tag.ts packages/next/tests/extensions.behavior.test.ts
git commit -m "feat: add explicit tag write helpers"
```

### Task 3: Update ExecutionContext + Scope usage

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Modify: `packages/next/src/scope.ts`
- Modify: `packages/next/src/types.ts`

**Step 1: Adjust constructor seeding**

Replace manual `tagStore.set` loops with `tag.writeToStore` (when seeding scope and execution tags). This may require importing `Tag` helpers or reusing existing tags.

**Step 2: Update `set` method**

`ExecutionContextImpl.set` should call `accessor.writeToStore(this.tagStore, value)` instead of the old `writeTo`. Ensure other call sites (like snapshot creation) use the correct helper.

**Step 3: Update types/comments**

If `ExecutionContext.Context` or `Core.Scope` docs reference `writeTo`, mention the new helper names instead.

**Step 4: Run targeted tests**

`pnpm vitest packages/next/tests/execution-context.behavior.test.ts`

**Step 5: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/src/scope.ts packages/next/src/types.ts
git commit -m "refactor: use writeToStore in execution context"
```

### Task 4: Documentation & references

**Files:**
- Modify: `docs/guides/tags.md` (or relevant doc)
- Modify: `.claude/skills/pumped-design/references/tags.md`

**Step 1: Update docs**

Document the three helpers with code samples:

```ts
const tagged = tag.writeToContainer(scope, value)
tag.writeToTags(tagArray, value)
tag.writeToStore(ctx.tagStore, value)
```

Explain cache invalidation behavior and when to use each helper.

**Step 2: Update skill reference**

Reflect the new API in `.claude/skills/pumped-design/references/tags.md`.

**Step 3: Commit**

```bash
git add docs/guides/tags.md .claude/skills/pumped-design/references/tags.md
git commit -m "docs: clarify tag write helpers"
```

### Task 5: Verification & rollout

**Step 1: Typecheck + tests**

Run full suite per project standards:

```
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
pnpm -F @pumped-fn/examples typecheck
```

**Step 2: Final review**

`git status`, `git diff --stat`

**Step 3: Summary**

Prepare final summary and next steps for user.

