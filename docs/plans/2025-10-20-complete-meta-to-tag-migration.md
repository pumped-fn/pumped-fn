# Complete Meta to Tag Migration Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Complete the migration from Meta namespace to Tag namespace with clean slate (no backward compatibility), renaming all `metas` properties and `meta` parameters to `tags`.

**Architecture:** Systematic bottom-up migration starting with type definitions, then implementation files, then tests, then documentation. Uses ast-grep for precise replacements where beneficial.

**Tech Stack:** TypeScript, pnpm, ast-grep

---

## Task 1: Update Tag Type Definitions

**Files:**
- Modify: `packages/next/src/tag-types.ts:20-24`

**Step 1: Remove backward compatibility from Tag.Container**

Update the `Container` interface and `Source` type to only use `tags`:

```typescript
export interface Container {
  tags?: Tagged[];
}

export type Source = Store | Container | Tagged[];
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: May have errors in other files (expected at this stage)

**Step 3: Commit**

```bash
git add packages/next/src/tag-types.ts
git commit -m "refactor(types)!: remove backward compat, use tags property only"
```

---

## Task 2: Update Tag Implementation

**Files:**
- Modify: `packages/next/src/tag.ts:39,54`

**Step 1: Remove metas fallback in extract function**

Replace line 39:

```typescript
// Before
const tags = Array.isArray(source) ? source : ((source as any).tags ?? (source as any).metas ?? []);

// After
const tags = Array.isArray(source) ? source : ((source as any).tags ?? []);
```

**Step 2: Remove metas fallback in collect function**

Replace line 54:

```typescript
// Before
const tags = Array.isArray(source) ? source : ((source as any).tags ?? (source as any).metas ?? []);

// After
const tags = Array.isArray(source) ? source : ((source as any).tags ?? []);
```

**Step 3: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Still may have errors in dependent files

**Step 4: Commit**

```bash
git add packages/next/src/tag.ts
git commit -m "refactor(tag)!: remove metas property backward compatibility"
```

---

## Task 3: Update Core Type Definitions

**Files:**
- Modify: `packages/next/src/types.ts:138-152,189,243,343,387,406,453,574`

**Step 1: Remove Meta namespace**

Delete lines 138-152 (entire Meta namespace declaration).

**Step 2: Replace Meta.MetaContainer with Tag.Container**

Using ast-grep or manual replacement:

```typescript
// In BaseExecutor interface (line ~189)
export interface BaseExecutor<T> extends Tag.Container {

// In Accessor interface (line ~243)
export interface Accessor<T> extends Tag.Container {

// In Scope interface (line ~343)
export interface Scope extends Tag.Container {
```

**Step 3: Update Flow.Definition**

Replace at line ~453:

```typescript
export type Definition<S, I> = {
  name: string;
  input: StandardSchemaV1<I>;
  output: StandardSchemaV1<S>;
  version?: string;
} & Tag.Container;
```

**Step 4: Update Flow.C context interface**

Replace at line ~574:

```typescript
export type C = {
  readonly scope: Core.Scope;
  readonly tags: Tag.Tagged[] | undefined;
  // ... rest of interface
```

**Step 5: Update exec() method signatures**

Replace `meta?:` with `tags?:` in Scope interface (lines ~387, ~406):

```typescript
exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    extensions?: Extension.Extension[];
    initialContext?: Array<
      [
        (
          | import("./tag-types").Tag.Tag<any, false>
          | import("./tag-types").Tag.Tag<any, true>
        ),
        any
      ]
    >;
    tags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;
```

**Step 6: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Should compile cleanly now

**Step 7: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types)!: replace Meta namespace with Tag, rename metas to tags"
```

---

## Task 4: Update Executor Implementation

**Files:**
- Modify: `packages/next/src/executor.ts:11,25,33,41,48,115,123`

**Step 1: Update internal createExecutor parameter**

Replace at line 11:

```typescript
function createExecutor<T>(
  kind: Core.Kind,
  factory: Core.NoDependencyFn<T> | Core.DependentFn<T, unknown> | undefined,
  dependencies: Core.UExecutor | Core.UExecutor[] | Record<string, Core.UExecutor> | undefined,
  tags: Tag.Tagged[] | undefined
): Core.BaseExecutor<T> {
```

**Step 2: Update property assignments**

Replace at lines 25, 33, 41, 48:

```typescript
tags: tags,
```

**Step 3: Update public provide() function signature**

Replace at line 115:

```typescript
export function provide<T>(
  factory: Core.NoDependencyFn<T>,
  ...tags: Tag.Tagged[]
): Core.Executor<T> {
```

**Step 4: Update public derive() function signature**

Replace at line 123:

```typescript
export function derive<T, D extends Core.DependencyLike>(
  dependencies: D,
  factory: Core.DependentFn<T, Core.InferOutput<D>>,
  ...tags: Tag.Tagged[]
): Core.Executor<T> {
```

**Step 5: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/executor.ts
git commit -m "refactor(executor)!: rename metas parameter to tags"
```

---

## Task 5: Update Scope Implementation

**Files:**
- Modify: `packages/next/src/scope.ts:42,50,441,996,1010,1024,1035,1044,1054`

**Step 1: Update ExecutionController property**

Replace at line 42:

```typescript
public tags: Tag.Tagged[] | undefined;
```

**Step 2: Update ExecutionController constructor**

Replace at line 50:

```typescript
constructor(scope: BaseScope, requestor: UE, tags: Tag.Tagged[] | undefined) {
  this.scope = scope;
  this.requestor = requestor;
  this.tags = tags;
}
```

**Step 3: Update BaseScope property**

Replace at line 441:

```typescript
public tags: Tag.Tagged[] | undefined;
```

**Step 4: Update exec() method signatures**

Replace `meta?:` with `tags?:` at lines 996, 1010, 1024:

```typescript
exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    extensions?: Extension.Extension[];
    initialContext?: Array<
      [
        (
          | import("./tag-types").Tag.Tag<any, false>
          | import("./tag-types").Tag.Tag<any, true>
        ),
        any
      ]
    >;
    tags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S> {
```

**Step 5: Update parameter usage in method implementations**

Replace at lines 1035, 1044:

```typescript
tags: options.tags,
// and
tags: options?.tags,
```

**Step 6: Update createScope options type**

Replace at line 1054:

```typescript
export type ScopeOption = {
  tags?: Tag.Tagged[];
};
```

**Step 7: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/next/src/scope.ts
git commit -m "refactor(scope)!: rename metas property and meta parameter to tags"
```

---

## Task 6: Update Flow Implementation

**Files:**
- Modify: `packages/next/src/flow.ts:41,63,127,151,160,184,189,249,615,638,639,651,652,664,665,669,893,930,959`

**Step 1: Update flowMeta type annotation**

Replace at line 41:

```typescript
}) as Tag.Tag<Flow.Definition<any, any>, true>;
```

**Step 2: Update FlowDefinition class property**

Replace at line 63:

```typescript
public readonly tags: Tag.Tagged[] = []
```

**Step 3: Update FlowDefinition constructor parameter**

Replace at line 127:

```typescript
tags?: Tag.Tagged[];
```

**Step 4: Update flow() function signatures**

Replace `meta?:` with `tags?:` at lines 151, 160:

```typescript
export function flow<I, O>(
  def: Omit<Flow.Definition<O, I>, "def">,
  handler: Flow.Handler<O, I>["fn"],
  options?: { tags?: Tag.Tagged[] }
): Flow.Flow<I, O> {
```

**Step 5: Update FlowExecutionContext property**

Replace at line 184:

```typescript
public readonly tags: Tag.Tagged[] | undefined;
```

**Step 6: Update FlowExecutionContext constructor parameter**

Replace at line 189:

```typescript
tags?: Tag.Tagged[],
```

**Step 7: Update meta find call to use tags**

Replace at line 249:

```typescript
const tagged = this.tags.find((m: Tag.Tagged) => m.key === key);
```

**Step 8: Update property assignment**

Replace at line 615:

```typescript
tags: this.tags,
```

**Step 9: Update execute() function signatures**

Replace `scopeMeta?:` and `meta?:` with `scopeTags?:` and `tags?:` at lines 638-639, 651-652, 664-665:

```typescript
export async function execute<O, I>(
  flow: Flow.Flow<I, O>,
  input: I,
  options?: {
    scope?: Core.Scope;
    scopeTags?: Tag.Tagged[];
    tags?: Tag.Tagged[];
    extensions?: Extension.Extension[];
  }
): Promised<O> {
```

**Step 10: Update execute() implementation**

Replace at line 669:

```typescript
const scope = options?.scope || createScope({ tags: options?.scopeTags });
```

Replace at lines 893, 930, 959 where definition is created:

```typescript
tags: definition.tags,
// and
tags: config.tags,
```

**Step 11: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 12: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor(flow)!: rename metas property and meta parameters to tags"
```

---

## Task 7: Update Multi Implementation

**Files:**
- Modify: `packages/next/src/multi.ts:14,17,21,85,88,115,117,139,141`

**Step 1: Update MultiExecutorPool type annotations**

Replace at lines 14, 17:

```typescript
private poolId: Tag.Tag<PoolIdType, true>;
// and
public id: Tag.Tag<PoolIdType, true>;
```

**Step 2: Update MultiExecutorPool constructor parameter**

Replace at line 21:

```typescript
poolId: Tag.Tag<PoolIdType, true>,
```

**Step 3: Update createMultiExecutorPool function signature**

Replace at lines 85, 88:

```typescript
function createMultiExecutorPool<T, K, D extends Core.DependencyLike>(
  poolId: Tag.Tag<PoolIdType, true>,
  dependencies: D,
  factory: Multi.DependentFn<T, K, Core.InferOutput<D>>,
  providerTags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
```

**Step 4: Update multi() function signature**

Replace at line 115:

```typescript
export function multi<T, K, D extends Core.DependencyLike>(
  dependencies: D,
  factory: Multi.DependentFn<T, K, Core.InferOutput<D>>,
  options: Multi.DeriveOption<K, D>,
  ...tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
```

**Step 5: Update poolId type in multi() implementation**

Replace at line 117:

```typescript
const poolId = tag(custom<null>(), { label: Symbol().toString(), default: null }) as Tag.Tag<null, true>;
```

**Step 6: Update multiLazy() function signature and implementation**

Replace at lines 139, 141:

```typescript
export function multiLazy<T, K>(
  factory: (key: K, scope: Core.Controller) => Core.Output<T>,
  options: Multi.Option<K>,
  ...tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
  const poolId = tag(custom<null>(), { label: Symbol().toString(), default: null }) as Tag.Tag<null, true>;
```

**Step 7: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/next/src/multi.ts
git commit -m "refactor(multi)!: rename Meta.MetaFn to Tag.Tag, metas to tags"
```

---

## Task 8: Update Errors and Index Files

**Files:**
- Modify: `packages/next/src/errors.ts:238`
- Modify: `packages/next/src/index.ts:1,36,38`

**Step 1: Update errors.ts Meta reference**

Replace at line 238:

```typescript
const executorName = name.find(executor as Tag.Container);
```

**Step 2: Remove Meta import from index.ts**

Remove at line 1:

```typescript
import type { Meta } from "./types";
```

**Step 3: Update name constant type annotation**

Replace at lines 36-38:

```typescript
export const name: Tag.Tag<string, true> = tag(custom<string>(), {
  label: "pumped-fn/name",
}) as Tag.Tag<string, true>;
```

**Step 4: Verify all source files compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/errors.ts packages/next/src/index.ts
git commit -m "refactor!: complete Meta to Tag migration in remaining source files"
```

---

## Task 9: Update Test Files

**Files:**
- Modify: `packages/next/tests/flow-execution-meta.test.ts:26,39,42,60,82`
- Modify: `packages/next/tests/meta.test.ts:57,72`
- Check: All other test files for `meta:` parameter usage

**Step 1: Update flow-execution-meta.test.ts parameters**

Replace all `meta:` with `tags:` at lines 26, 39, 42, 60, 82:

```typescript
// Example
await scope.exec(testFlow, undefined, {
  tags: [requestId({ requestId: "req-123" })],
});
```

**Step 2: Update meta.test.ts parameters**

Replace all `meta:` with `tags:` at lines 57, 72:

```typescript
// Example
const scope = createScope({
  tags: [configTag("production"), debugTag("off")],
});
```

**Step 3: Search for remaining meta: parameters**

Run: `ast-grep --pattern 'meta: [$$$]' packages/next/tests`
Replace any remaining occurrences.

**Step 4: Verify tests compile**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 5: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/next/tests/
git commit -m "test!: update test files to use tags parameter instead of meta"
```

---

## Task 10: Update Primary Documentation - meta.md

**Files:**
- Modify: `docs/meta.md` (entire file)

**Step 1: Update title and introduction**

Replace lines 1-7:

```markdown
# Tag System - Typed Metadata Decoration

Tag provides type-safe metadata attachment to executors, flows, and other components without affecting their core logic. It uses StandardSchema for validation and enables powerful extension patterns.

## Core Concept

Tag provides typed metadata decoration without logic inference. Components operate independently; tags decorate them for extensibility and configuration.
```

**Step 2: Update first code example**

Replace lines 9-19:

```typescript
import { tag, custom, provide } from "@pumped-fn/core-next";

// Define tag type
const route = tag(custom<{ path: string; method: string }>(), { label: "route" });

// Attach to executor
const handler = provide(() => ({ process: () => "result" }), route({ path: "/api/users", method: "GET" }));

// Query tag
const routeConfig = route.find(handler); // { path: "/api/users", method: "GET" } | undefined
```

**Step 3: Update "Core API" section**

Replace section title and examples (lines 22-38):

```markdown
### Tag Creation

```typescript
import { tag, custom } from "@pumped-fn/core-next";

// Create tag function with schema
const description = tag(custom<string>(), { label: "description" });
const config = tag(custom<{ timeout: number; retries: number }>(), { label: "config" });
const tags = tag(custom<string[]>(), { label: "tags" });

// Create tagged instances
const descTag = description("User service for authentication");
const configTag = config({ timeout: 5000, retries: 3 });
const tagsTag = tags(["auth", "user", "api"]);
```
```

**Step 4: Update Query Methods examples**

Replace lines 42-55:

```typescript
import { tag, custom, provide } from "@pumped-fn/core-next";

const name = tag(custom<string>(), { label: "name" });
const priority = tag(custom<number>(), { label: "priority" });

const service = provide(() => {}, name("auth-service"), priority(1), priority(2));

// Query methods
const serviceName = name.find(service);     // "auth-service" | undefined
const firstPriority = priority.find(service); // 1 | undefined (first match)
const allPriorities = priority.some(service);  // [1, 2] (all matches)
const nameRequired = name.get(service);     // "auth-service" (throws if not found)
```

**Step 5: Update Container interface**

Replace lines 57-66:

```markdown
### Tag.Container Interface

```typescript
interface Container {
  tags?: Tag.Tagged[]
}

// Executors, Accessors, Flows all implement Tag.Container
// You can attach tags to any of these types
```
```

**Step 6: Update Integration Patterns section**

Replace all remaining code examples in the file, changing:
- `meta()` → `tag()`
- Add `{ label: "..." }` to tag creation
- `metas` property → `tags` property
- `meta:` parameter → `tags:`

**Step 7: Verify markdown renders correctly**

Check: Open in markdown viewer or docs site
Expected: All code examples valid, no broken references

**Step 8: Commit**

```bash
git add docs/meta.md
git commit -m "docs!: update meta.md to reflect tag API migration"
```

---

## Task 11: Update Migration Guide

**Files:**
- Modify: `docs/migration-guides/accessor-meta-to-tag.md:127-172,276-299,313-326`

**Step 1: Update Meta with Scope Configuration example**

Replace lines 127-145 to show `tags` parameter:

```markdown
#### Tag with Scope Configuration

```typescript
// Before
import { meta, custom, createScope } from "@pumped-fn/core-next";

const config = meta('config', custom<string>());
const scope = createScope({
  meta: [config('production')]
});

const executor = provide((controller) => {
  return config.get(controller.scope);
});

// After
import { tag, custom, createScope } from "@pumped-fn/core-next";

const config = tag(custom<string>(), { label: 'config' });
const scope = createScope({
  tags: [config('production')]
});

const executor = provide((controller) => {
  return config.get(controller.scope);
});
```
```

**Step 2: Update Flow Execution example**

Replace lines 148-173 to show `tags` parameter:

```markdown
#### Flow Execution Tags

```typescript
// Before
import { flow, meta, custom } from "@pumped-fn/core-next";

const requestId = meta('request.id', custom<string>());
const getRequestId = flow((context) => {
  return requestId.get(context);
});

await flow.execute(getRequestId, undefined, {
  meta: [requestId('req-123')]
});

// After
import { flow, tag, custom } from "@pumped-fn/core-next";

const requestId = tag(custom<string>(), { label: 'request.id' });
const getRequestId = flow((context) => {
  return requestId.get(context);
});

await flow.execute(getRequestId, undefined, {
  tags: [requestId('req-123')]
});
```
```

**Step 3: Update Breaking Changes - Type Changes section**

Replace lines 276-291:

```markdown
### Type Changes

The `Meta` namespace has been removed entirely:

```typescript
// Old - REMOVED
Meta.Meta<T> // No longer exists
Meta.MetaFn<T> // No longer exists
Meta.MetaContainer // No longer exists

// New - Use Tag namespace
Tag.Tagged<T> // Unified tagged value type
Tag.Tag<T, false> // Tag without default
Tag.Tag<T, true> // Tag with default
Tag.Container // Replaces MetaContainer
Tag.Store // Map-like storage
Tag.Source // Union of valid sources
```
```

**Step 4: Add new breaking change about property names**

Insert after line 291:

```markdown
### Property and Parameter Names

All instances of `metas` property and `meta` parameter have been renamed to `tags`:

```typescript
// Property access
executor.tags // was: executor.metas
scope.tags // was: scope.metas
accessor.tags // was: accessor.metas

// Function parameters
createScope({ tags: [...] }) // was: { meta: [...] }
scope.exec(flow, input, { tags: [...] }) // was: { meta: [...] }
flow.execute(handler, input, { tags: [...] }) // was: { meta: [...] }
```

**No backward compatibility:** Code using `metas` property or `meta` parameters will break and must be updated.
```

**Step 5: Update Compatibility Notes section**

Replace lines 313-326:

```markdown
## Compatibility Notes

**No backward compatibility** - This is a breaking change requiring updates:

1. All `metas` property access must change to `tags`
2. All `meta:` parameters must change to `tags:`
3. All `Meta` namespace references must change to `Tag`
4. The `metas` property is no longer checked by tag operations

Migration must be complete - partial migration will result in runtime errors.
```

**Step 6: Verify markdown renders correctly**

Check: Open in markdown viewer
Expected: All examples accurate, breaking changes clear

**Step 7: Commit**

```bash
git add docs/migration-guides/accessor-meta-to-tag.md
git commit -m "docs!: update migration guide with tags parameter breaking changes"
```

---

## Task 12: Update Remaining Documentation Files

**Files:**
- Search and update: `docs/*.md` (15 files with Meta references)

**Step 1: Find all Meta references in docs**

Run: `grep -r "meta:" docs/*.md --exclude-dir=node_modules`
Note: All files with `meta:` parameters

**Step 2: Update each file systematically**

For each file found:
- Replace `meta:` → `tags:` in code examples
- Replace `Meta.` → `Tag.` in type references
- Replace `metas` → `tags` in property access examples
- Update prose referring to "meta" system to "tag" system where appropriate

**Step 3: Update specific files based on grep results**

Files likely needing updates:
- `docs/validation.md`
- `docs/how-does-it-work.md`
- `docs/index.md`
- `docs/accessor.md`
- `docs/api.md`
- `docs/authoring.md`

**Step 4: Verify all documentation compiles**

Run through each file:
- Check TypeScript code blocks would compile
- Check all internal links still work
- Check terminology is consistent

**Step 5: Commit**

```bash
git add docs/*.md
git commit -m "docs!: complete tag API migration across all documentation"
```

---

## Task 13: Final Verification

**Files:**
- All modified files

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS with no errors

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 3: Run build**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: Build succeeds

**Step 4: Verify no remaining Meta references in source**

Run: `grep -r "Meta\." packages/next/src --exclude-dir=node_modules`
Expected: No matches (or only in comments)

**Step 5: Verify no remaining metas property in source**

Run: `grep -r "metas:" packages/next/src --exclude-dir=node_modules`
Expected: No matches

**Step 6: Verify no remaining meta: parameters**

Run: `grep -r "meta:" packages/next --exclude-dir=node_modules`
Expected: Only matches in docs or plan files

**Step 7: Final commit if any cleanup needed**

```bash
git add .
git commit -m "chore: final cleanup after tag migration"
```

---

## Summary

**Total Breaking Changes:**
1. `Meta` namespace removed - use `Tag` namespace
2. `metas` property renamed to `tags` everywhere
3. `meta:` parameters renamed to `tags:` everywhere
4. No backward compatibility - all code must update

**Files Modified:**
- 9 source files
- Multiple test files
- 15+ documentation files

**Verification Commands:**
```bash
pnpm -F @pumped-fn/core-next typecheck:full  # Types
pnpm -F @pumped-fn/core-next test            # Tests
pnpm -F @pumped-fn/core-next build           # Build
```

**Recommended Commit Convention:**
- Use `!` suffix for breaking changes: `refactor!:`, `docs!:`
- Keep commits atomic (one logical change per commit)
- Run verification after each task
