# C3 Documentation Update for Hierarchical ExecutionContext Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update C3 documentation to reflect the implemented ADR-015 hierarchical ExecutionContext with parent-child relationships, isolated data maps, and auto-close behavior.

**Architecture:** Documentation updates span 4 files: ADR-015 status, c3-203 component doc (interface + sections), c3-2 container doc (extension pattern), and TOC regeneration.

**Tech Stack:** Markdown, C3 documentation structure v3

---

## Audit Findings Summary

- **Critical**: ADR-015 marked "proposed" but implemented; ExecutionContext interface outdated
- **Major**: Missing hierarchical execution section, outdated lifecycle docs, missing tracing pattern, wrong test count (102 vs 145)
- **Files Affected**: `.c3/adr/adr-015-hierarchical-execution-context.md`, `.c3/c3-2-lite/c3-203-flow.md`, `.c3/c3-2-lite/README.md`, `.c3/TOC.md`

---

## Task 1: Update ADR-015 Status

**Files:**
- Modify: `.c3/adr/adr-015-hierarchical-execution-context.md:14-15`

**Step 1: Change status from "proposed" to "accepted"**

Update lines 14-15 from:
```markdown
## Status {#adr-015-status}
**Proposed** - 2025-12-08
```

To:
```markdown
## Status {#adr-015-status}
**Accepted** - 2025-12-08
```

**Step 2: Verify change**

Run: `grep -A1 "Status {#adr-015-status}" .c3/adr/adr-015-hierarchical-execution-context.md`

Expected output:
```
## Status {#adr-015-status}
**Accepted** - 2025-12-08
```

**Step 3: Commit**

```bash
git add .c3/adr/adr-015-hierarchical-execution-context.md
git commit -m "docs(c3): mark ADR-015 as accepted"
```

---

## Task 2: Update ExecutionContext Interface in c3-203

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md:38-50`

**Step 1: Update ExecutionContext interface section**

Replace lines 38-50:

```markdown
### ExecutionContext

Created by `scope.createContext()`, used for flow execution:

```typescript
interface ExecutionContext {
  readonly input: unknown              // Current flow input
  readonly scope: Scope                // Parent scope
  exec(options): Promise<T>            // Execute flow or function
  onClose(fn: () => MaybePromise<void>): void  // Register cleanup
  close(): Promise<void>               // Run cleanups
}
```
```

With:

```markdown
### ExecutionContext

Created by `scope.createContext()`, used for flow execution:

```typescript
interface ExecutionContext {
  readonly input: unknown                        // Current execution's input
  readonly scope: Scope                          // Parent scope
  readonly parent: ExecutionContext | undefined  // Parent context (undefined for root)
  readonly data: Map<symbol, unknown>            // Per-execution storage for extensions
  exec(options): Promise<T>                      // Execute flow or function (creates child)
  onClose(fn: () => MaybePromise<void>): void    // Register cleanup
  close(): Promise<void>                         // Run cleanups
}
```

**Key properties:**
- `parent`: References the calling context. Root contexts (from `createContext()`) have `undefined`.
- `data`: Lazy-initialized Map for extension private storage. Use symbols as keys for encapsulation.
- `exec()`: Creates a child context with `parent` set to current context, auto-closes after execution.
```

**Step 2: Verify formatting**

Run: `sed -n '38,70p' .c3/c3-2-lite/c3-203-flow.md`

Expected: Should see updated interface with parent and data properties, plus Key properties section.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): update ExecutionContext interface with parent and data"
```

---

## Task 3: Add Hierarchical Execution Section to c3-203

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md` (insert after line 243, before "## Type Safety")

**Step 1: Insert new "Hierarchical Execution" section**

After line 243 (after "Closed Context Error" section, before "## Type Safety"), insert:

```markdown
## Hierarchical Execution {#c3-203-hierarchical}

### Child Context Per Exec

Each `ctx.exec()` call creates a **child context** with:
- `parent` reference to the calling context
- Own `data` Map (isolated from siblings)
- Own `input` (no mutation of parent)
- Auto-closes when execution completes

```typescript
const rootCtx = scope.createContext()
// rootCtx.parent === undefined
// rootCtx.input === undefined

await rootCtx.exec({ flow: myFlow, input: 'data' })
// Inside myFlow factory:
//   childCtx.parent === rootCtx
//   childCtx.input === 'data'
//   childCtx.data === new Map()
// After exec returns: childCtx is closed
```

### Parent Chain Navigation

```typescript
const parentFlow = flow({
  factory: async (ctx) => {
    console.log('Parent context')

    await ctx.exec({
      flow: flow({
        factory: async (childCtx) => {
          console.log('Child context')
          console.log(childCtx.parent === ctx) // true

          await childCtx.exec({
            flow: flow({
              factory: (grandchildCtx) => {
                console.log('Grandchild context')
                console.log(grandchildCtx.parent === childCtx) // true
                console.log(grandchildCtx.parent?.parent === ctx) // true
              }
            })
          })
        }
      })
    })
  }
})
```

### Isolated Data Maps

Each execution has its own data map, preventing concurrent access races:

```typescript
// Concurrent siblings have isolated data
await Promise.all([
  ctx.exec({ flow: flowA }),  // childA.data (separate Map)
  ctx.exec({ flow: flowB })   // childB.data (separate Map)
])

// No race conditions - each child has independent storage
```

### Auto-Close Lifecycle

Child contexts automatically close when `exec()` completes:

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    // ctx is a CHILD context (not root)
    ctx.onClose(() => console.log('Child cleanup'))

    return 'result'
  }
})

await rootCtx.exec({ flow: myFlow })
// Logs "Child cleanup" HERE (after factory returns, before exec() returns)

await rootCtx.close()
// No additional cleanup - child already closed
```

**Critical:** Cleanups registered via `ctx.onClose()` run when the **child context** auto-closes (after factory returns), not when root context manually closes.

### Deferred Execution Pattern

Captured child context is closed after exec returns. For deferred work, create a dedicated context:

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    // WRONG: setTimeout with captured ctx
    // setTimeout(() => ctx.exec({ flow: later }), 100)
    // ^ Throws "ExecutionContext is closed"

    // CORRECT: Create dedicated context
    const scope = ctx.scope
    setTimeout(async () => {
      const deferredCtx = scope.createContext()
      try {
        await deferredCtx.exec({ flow: later })
      } finally {
        await deferredCtx.close()
      }
    }, 100)

    return 'immediate result'
  }
})
```

### Extension Usage: Tracing with Parent Chain

Extensions receive child context and can access parent data:

```typescript
const SPAN_KEY = Symbol('tracing.span')

const tracingExtension: Extension = {
  name: 'tracing',
  wrapExec: async (next, target, ctx) => {
    // Read parent span from parent's data
    const parentSpan = ctx.parent?.data.get(SPAN_KEY) as Span | undefined

    const span = tracer.startSpan({
      name: isFlow(target) ? (target.name ?? 'anonymous') : 'fn',
      parent: parentSpan  // Automatic parent-child relationship!
    })

    // Store in THIS context's data
    ctx.data.set(SPAN_KEY, span)

    try {
      return await next()
    } finally {
      span.end()
    }
  }
}
```

### Breaking Changes from ADR-015

#### 1. onClose() Timing

**Before:** Cleanup ran on manual `ctx.close()`.

**After:** Cleanup runs when exec completes (child auto-close).

```typescript
// BEFORE: Shared context, cleanup on manual close
const ctx = scope.createContext()
await ctx.exec({
  flow: flow({
    factory: (ctx) => {
      ctx.onClose(() => console.log('cleanup'))
    }
  })
})
// Cleanup NOT run yet
await ctx.close()  // Cleanup runs HERE

// AFTER: Child context, cleanup on exec completion
await ctx.exec({
  flow: flow({
    factory: (ctx) => {  // ctx is CHILD
      ctx.onClose(() => console.log('cleanup'))
    }
  })
})
// Cleanup runs HERE (child auto-closed)
await ctx.close()  // Nothing additional runs
```

**Migration:** If cleanup must run on root close, traverse to root:

```typescript
const myFlow = flow({
  factory: (ctx) => {
    // Find root context
    let root = ctx
    while (root.parent) root = root.parent

    // Register on root, not child
    root.onClose(() => console.log('cleanup on root'))
  }
})
```

#### 2. ctx.input Isolation

**Before:** `ctx.input` mutated on each exec (footgun).

**After:** Each child has immutable `input`.

```typescript
// BEFORE: Mutation footgun
await ctx.exec({ flow: f1, input: 'a' })  // ctx.input = 'a'
await ctx.exec({ flow: f2, input: 'b' })  // ctx.input = 'b' (overwrites!)

// AFTER: Isolated per child
await ctx.exec({ flow: f1, input: 'a' })  // childA.input = 'a'
await ctx.exec({ flow: f2, input: 'b' })  // childB.input = 'b'
// ctx.input unchanged (undefined for root)
```

#### 3. Closed Context After Exec

**Before:** Same context reused across execs.

**After:** Child context closed after exec returns.

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    setTimeout(() => {
      // BEFORE: Would work
      // AFTER: Throws "ExecutionContext is closed"
      ctx.exec({ flow: later })
    }, 100)
  }
})
```

**Migration:** Use dedicated context pattern (see "Deferred Execution Pattern" above).
```

**Step 2: Verify section was inserted**

Run: `grep -n "## Hierarchical Execution" .c3/c3-2-lite/c3-203-flow.md`

Expected: Should show line number where section was added.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): add hierarchical execution section to c3-203"
```

---

## Task 4: Update "ExecutionContext Lifecycle" Section in c3-203

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md:186-233`

**Step 1: Update "Registering Cleanup" subsection**

Replace the "Registering Cleanup" subsection (around lines 199-212) with:

```markdown
### Registering Cleanup

Cleanups registered via `onClose()` run on **child context auto-close**, not root close:

```typescript
const resourceFlow = flow({
  factory: (ctx) => {
    // ctx is a CHILD context created by exec()
    const resource = acquireResource()

    // Cleanup runs when THIS exec() completes
    ctx.onClose(() => resource.release())

    return resource
  }
})

await rootCtx.exec({ flow: resourceFlow })
// resource.release() called HERE (child auto-closes)
```

**Note:** If you need cleanup on root close instead of exec completion, traverse to root via `ctx.parent` chain (see "Hierarchical Execution" section).
```

**Step 2: Update "Context Reuse" subsection**

Replace the "Context Reuse" subsection (around lines 221-233) with:

```markdown
### Context Reuse

A single **root** context can execute multiple flows. Each exec creates a **child** context:

```typescript
const rootCtx = scope.createContext()

// Each exec creates a child with isolated input and data
await rootCtx.exec({ flow: authFlow, input: credentials })
// childA.input = credentials, childA auto-closes after authFlow returns

await rootCtx.exec({ flow: loadDataFlow, input: query })
// childB.input = query, childB auto-closes after loadDataFlow returns

await rootCtx.exec({ flow: saveResultFlow, input: data })
// childC.input = data, childC auto-closes after saveResultFlow returns

await rootCtx.close()
// Only root cleanups run (children already closed)
```

**Key insight:** Root context's `input` remains `undefined`. Children get their own `input` from exec options.
```

**Step 3: Verify changes**

Run: `sed -n '186,250p' .c3/c3-2-lite/c3-203-flow.md | grep -A5 "Registering Cleanup"`

Expected: Should see updated "Registering Cleanup" with child auto-close explanation.

**Step 4: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): update ExecutionContext lifecycle with auto-close behavior"
```

---

## Task 5: Update "Nested Execution" Section in c3-203

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md:245-289`

**Step 1: Update section introduction**

Replace "Executing Flows from Flows" subsection (around lines 247-258) with:

```markdown
### Executing Flows from Flows

Each nested `ctx.exec()` creates a **grandchild** context:

```typescript
const parentFlow = flow({
  factory: async (ctx) => {
    // ctx is child of root
    console.log(ctx.parent !== undefined) // true (parent is root)

    const childResult = await ctx.exec({
      flow: childFlow,
      input: ctx.input
    })
    // grandchild created (parent = ctx), auto-closed after childFlow returns

    return processResult(childResult)
  }
})

const rootCtx = scope.createContext()
await rootCtx.exec({ flow: parentFlow })
// Creates child (parentFlow's ctx), which creates grandchild (childFlow's ctx)
```

**Context tree:**
```
rootCtx (parent: undefined)
└─> childCtx (parent: rootCtx) - parentFlow's ctx
    └─> grandchildCtx (parent: childCtx) - childFlow's ctx
```
```

**Step 2: Verify changes**

Run: `sed -n '245,280p' .c3/c3-2-lite/c3-203-flow.md`

Expected: Should see updated nested execution with grandchild explanation and context tree diagram.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): clarify nested execution creates grandchild contexts"
```

---

## Task 6: Update Testing Section in c3-203

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md:381-392`

**Step 1: Add hierarchical-context.test.ts reference**

Replace the Testing section (lines 381-392) with:

```markdown
## Testing {#c3-203-testing}

Key test scenarios in `tests/flow.test.ts`:
- Flow creation with/without dependencies
- Type inference for dependencies

Key test scenarios in `tests/hierarchical-context.test.ts` (15 tests):
- Root context has undefined parent
- Child context has parent reference
- Grandchild has correct parent chain
- Each execution has isolated data Map
- Concurrent siblings don't share data
- Child context auto-closes after exec
- onClose callbacks run on child auto-close
- Captured child context throws after close
- Extensions receive child context with parent access
- Tracing pattern with parent span propagation

Key test scenarios in `tests/scope.test.ts`:
- Context creation and execution
- Nested execution
- Tag merging
- Extension wrapping
- Context cleanup
```

**Step 2: Verify changes**

Run: `sed -n '381,410p' .c3/c3-2-lite/c3-203-flow.md`

Expected: Should see three test file sections including hierarchical-context.test.ts.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): add hierarchical-context.test.ts to testing section"
```

---

## Task 7: Update Extension System in c3-2 README

**Files:**
- Modify: `.c3/c3-2-lite/README.md:211-246`

**Step 1: Add tracing extension example**

After the existing logging extension example (around line 246), add:

```markdown

**Example tracing extension with hierarchical context:**

```typescript
const SPAN_KEY = Symbol('tracing.span')

interface Span {
  name: string
  parent?: Span
  end(): void
}

const tracingExtension: Lite.Extension = {
  name: 'tracing',
  wrapExec: async (next, target, ctx) => {
    // Extensions receive CHILD context (created by exec)
    // Access parent span from parent context's data
    const parentSpan = ctx.parent?.data.get(SPAN_KEY) as Span | undefined

    const span: Span = {
      name: isFlow(target) ? (target.name ?? 'anonymous') : 'fn',
      parent: parentSpan,  // Automatic parent-child relationship!
      end: () => console.log(`Span ended: ${span.name}`)
    }

    // Store span in THIS context's data (isolated per execution)
    ctx.data.set(SPAN_KEY, span)

    try {
      const result = await next()
      return result
    } finally {
      span.end()
    }
  }
}

const scope = createScope({ extensions: [tracingExtension] })
const ctx = scope.createContext()

await ctx.exec({
  flow: flow({
    name: 'parent',
    factory: async (ctx) => {
      // parentSpan stored in ctx.data

      await ctx.exec({
        flow: flow({
          name: 'child',
          factory: async (ctx) => {
            // childSpan.parent = parentSpan (automatic!)
          }
        })
      })
    }
  })
})
// Hierarchical span tree created without AsyncLocalStorage!
```

**Key pattern:**
- Each `ctx.exec()` creates child context with isolated `data` Map
- Extensions read `ctx.parent?.data` for parent info
- Extensions write to `ctx.data` for current execution
- Enables nested tracing without global state or AsyncLocalStorage
```

**Step 2: Verify addition**

Run: `grep -A10 "Example tracing extension" .c3/c3-2-lite/README.md`

Expected: Should see the new tracing extension section.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/README.md
git commit -m "docs(c3): add tracing extension example to c3-2"
```

---

## Task 8: Update Test Count in c3-2 README

**Files:**
- Modify: `.c3/c3-2-lite/README.md:248-255`

**Step 1: Update test count**

Find the Testing section (around line 254) and replace:

```markdown
**Test organization:**
- Unit tests per source file
- Type tests using `expectTypeOf` from Vitest
- 102 tests covering all components
```

With:

```markdown
**Test organization:**
- Unit tests per source file
- Type tests using `expectTypeOf` from Vitest
- 145 tests covering all components (including 15 hierarchical context tests)
```

**Step 2: Verify change**

Run: `grep "145 tests" .c3/c3-2-lite/README.md`

Expected: Should find the updated line.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/README.md
git commit -m "docs(c3): update test count from 102 to 145"
```

---

## Task 9: Add ADR-015 to TOC

**Files:**
- Modify: `.c3/TOC.md` (insert after ADR-014 section, around line 205)

**Step 1: Insert ADR-015 entry**

After the ADR-014 entry (around line 205), before ADR-013, insert:

```markdown

### [adr-015](./adr/adr-015-hierarchical-execution-context.md) - Hierarchical ExecutionContext with Parent-Child Per Exec
> Create child ExecutionContext per exec() call with parent reference and
isolated data map, enabling nested span tracing without race conditions
or AsyncLocalStorage dependency.

**Status**: Accepted

**Sections**:
- [Status](#adr-015-status)
- [Problem/Requirement](#adr-015-problem)
- [Exploration Journey](#adr-015-exploration)
- [Solution](#adr-015-solution)
- [Implementation](#adr-015-implementation)
- [Execution Flow Sequence](#adr-015-sequence)
- [Cleanup Lifecycle Sequence](#adr-015-cleanup-sequence)
- [Closure Capture Behavior](#adr-015-closure)
- [Root Context Behavior](#adr-015-root)
- [Extension Usage for Tracing](#adr-015-tracing)
- [Concurrent Safety](#adr-015-concurrent)
- [Breaking Changes](#adr-015-breaking)
- [Complexity Estimate](#adr-015-complexity)
- [Alternative Considered](#adr-015-alternative)
- [Changes Across Layers](#adr-015-changes)
- [Verification](#adr-015-verification)
- [Migration Guide](#adr-015-migration)
- [Related](#adr-015-related)

---
```

**Step 2: Update Quick Reference counts**

Find the "Quick Reference" section at the end (around line 456) and update:

From:
```markdown
**Total Documents**: 23
**Contexts**: 1 | **Containers**: 2 | **Components**: 6 | **ADRs**: 14
```

To:
```markdown
**Total Documents**: 24
**Contexts**: 1 | **Containers**: 2 | **Components**: 6 | **ADRs**: 15
```

**Step 3: Verify changes**

Run: `grep "adr-015" .c3/TOC.md`

Expected: Should find the new ADR-015 entry.

Run: `grep "ADRs: 15" .c3/TOC.md`

Expected: Should find the updated count.

**Step 4: Commit**

```bash
git add .c3/TOC.md
git commit -m "docs(c3): add ADR-015 to TOC and update document counts"
```

---

## Task 10: Final Verification

**Step 1: Run full typecheck**

```bash
cd /home/lagz0ne/dev/pumped-fn/.worktrees/hierarchical-context
pnpm -F @pumped-fn/lite typecheck:full
```

Expected: No errors.

**Step 2: Run full test suite**

```bash
pnpm -F @pumped-fn/lite test
```

Expected: 145 tests passing.

**Step 3: Verify all C3 docs are valid markdown**

```bash
find .c3 -name "*.md" -exec markdown-link-check {} \; 2>&1 | grep -E "(✓|✗)"
```

Expected: All links valid (or skip if markdown-link-check not available).

**Step 4: Review all changes**

```bash
git log --oneline --decorate --graph -10
```

Expected: Should see 9 commits from this plan.

**Step 5: Create summary commit**

```bash
git log --oneline HEAD~9..HEAD > /tmp/c3-doc-updates.txt
git commit --allow-empty -m "$(cat <<'EOF'
docs(c3): complete C3 documentation update for ADR-015

Summary of changes:
- Mark ADR-015 as accepted (implemented)
- Update ExecutionContext interface with parent and data
- Add comprehensive hierarchical execution section
- Document auto-close lifecycle and breaking changes
- Add tracing extension pattern example
- Update test count (102 -> 145)
- Add hierarchical-context.test.ts to testing sections
- Add ADR-015 to TOC

All C3 docs now reflect the implemented hierarchical ExecutionContext
from ADR-015. Documentation matches actual codebase behavior.

Refs: ADR-015
EOF
)"
```

---

## Notes

**C3 Documentation Structure:**
- ADRs document decisions and rationale
- Container docs (c3-X) document package-level architecture
- Component docs (c3-XYZ) document module-level details
- TOC provides navigation and document inventory

**Key C3 Principles:**
- Documentation must match implementation
- ADRs track from "proposed" to "accepted" to reflect implementation status
- Testing sections must list actual test files and coverage
- Extension patterns demonstrate cross-cutting concerns

**References:**
- ADR-015: `.c3/adr/adr-015-hierarchical-execution-context.md`
- Component doc: `.c3/c3-2-lite/c3-203-flow.md`
- Container doc: `.c3/c3-2-lite/README.md`
- TOC: `.c3/TOC.md`
- Implementation: `packages/lite/src/scope.ts`, `packages/lite/src/types.ts`
- Tests: `packages/lite/tests/hierarchical-context.test.ts` (15 tests)
