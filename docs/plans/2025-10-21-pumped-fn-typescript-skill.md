# Pumped-fn TypeScript Skill Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Create auto-activating skill that ensures high-quality, type-safe code when using `@pumped-fn/core-next` through pattern checking and embedded examples.

**Architecture:** Skill detects `@pumped-fn/core-next` imports, scans code against 3-tier pattern rules (critical/important/best-practices), references embedded canonical examples for guidance, maintains strict type safety focus.

**Tech Stack:** Markdown (skill definition), TypeScript examples (embedded patterns), superpowers skills framework

---

## Task 1: Create Skill Directory Structure

**Files:**
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/SKILL.md`
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/examples/`
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/pattern-reference.md`

**Step 1: Create directories**

```bash
mkdir -p /home/lagz0ne/.config/superpowers/skills/skills/libraries
mkdir -p /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/examples
```

**Step 2: Verify structure**

Run: `ls -la /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/`
Expected: Directory exists with `examples/` subdirectory

---

## Task 2: Copy Canonical Examples

**Files:**
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/examples/*.ts` (13 files)

**Step 1: Copy all example files**

```bash
cp /home/lagz0ne/dev/pumped-fn/examples/http-server/*.ts \
   /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/examples/
```

**Step 2: Copy shared directory**

```bash
cp -r /home/lagz0ne/dev/pumped-fn/examples/http-server/shared \
   /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/examples/
```

**Step 3: Verify examples copied**

Run: `ls -la /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/examples/`
Expected: 13 .ts files + shared/ directory

---

## Task 3: Create Pattern Reference Mapping

**Files:**
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/pattern-reference.md`

**Step 1: Write pattern reference document**

```markdown
# Pumped-fn Pattern Reference

Quick lookup mapping common patterns to canonical examples.

## Type Safety & Inference

**Pattern**: Maintaining strict types without `any`/`unknown`/casting
**Example**: `examples/type-inference.ts`
**Key Points**:
- Use derive() for type propagation
- Leverage factory function destructuring
- Let TypeScript infer from graph structure

## Dependency Modifiers

**Pattern**: `.reactive()` - downstream re-executes on upstream changes
**Example**: `examples/reactive-updates.ts`
**Key Points**:
- Use for values that need to trigger downstream re-computation
- Only declare reactive on consuming side, not producing side

**Pattern**: `.lazy()` - conditional dependency resolution
**Example**: `examples/flow-composition.ts`
**Key Points**:
- Dependency only resolved when actually accessed
- Useful for conditional branches in graph

**Pattern**: `.static()` - controller/updater pattern
**Example**: `examples/scope-lifecycle.ts`
**Key Points**:
- Doesn't re-execute when dependencies change
- Used for update functions, controllers

## Tag System

**Pattern**: Type-safe tag declaration and usage
**Example**: `examples/tags-foundation.ts`
**Key Points**:
- Define tags with explicit types
- Use tag() helper for type inference
- Reference tags consistently across graph

## Scope vs Flow Lifecycle

**Pattern**: Long-running resources in scope
**Example**: `examples/scope-lifecycle.ts`
**Key Points**:
- Database connections, servers go in scope
- Scope lives for application lifetime
- Use scope.dispose() for cleanup

**Pattern**: Short-span operations in flows
**Example**: `examples/flow-composition.ts`
**Key Points**:
- Request handling, transactions use flows
- Flow has root context (map-like)
- Sub-flows fork context automatically

## Flow Patterns

**Pattern**: Context management and sub-flow execution
**Example**: `examples/flow-composition.ts`
**Key Points**:
- Root context for flow-specific data
- Sequential vs parallel sub-flows
- Dispose flow to cleanup resources

**Pattern**: Database transactions per flow
**Example**: `examples/database-transaction.ts`
**Key Points**:
- Transaction opened in flow context
- Committed/rolled back on flow completion
- Extension pattern for automatic handling

## Extension Patterns

**Pattern**: Cross-cutting concerns via extensions
**Example**: `examples/extension-logging.ts`
**Key Points**:
- Use for logging, metrics, transactions
- Hook into scope/flow/executor lifecycle
- Configure via meta on scope/flow

## Testing Patterns

**Pattern**: Graph swapping for mocks
**Example**: `examples/testing-setup.ts`
**Key Points**:
- Swap executors at scope creation
- Mock dependencies without changing code
- Test-specific configurations via meta

## Basic Patterns

**Pattern**: Simple executor and scope setup
**Example**: `examples/basic-handler.ts`
**Key Points**:
- Define executors with factory functions
- Declare upstream dependencies
- Create scope and access values

## Error Handling

**Pattern**: Error boundaries and propagation
**Example**: `examples/error-handling.ts`
**Key Points**:
- Errors propagate through graph
- Use error boundary extensions
- Type-safe error handling

## Middleware Chain

**Pattern**: Composable middleware pattern
**Example**: `examples/middleware-chain.ts`
**Key Points**:
- Chain executors for request processing
- Use flow context for middleware data
- Type-safe middleware composition

## Comprehensive Example

**Pattern**: Full-featured application structure
**Example**: `examples/promised-comprehensive.ts`
**Key Points**:
- Complete scope/flow/extension setup
- Real-world patterns combined
- Production-ready structure
```

**Step 2: Verify file created**

Run: `cat /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/pattern-reference.md | head -20`
Expected: Pattern reference content visible

---

## Task 4: Write SKILL.md - Frontmatter and Overview

**Files:**
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/SKILL.md`

**Step 1: Write skill frontmatter and overview**

```markdown
---
name: Pumped-fn TypeScript
description: Auto-activating guidance for @pumped-fn/core-next ensuring type-safe, pattern-consistent code
when_to_use: automatically activates when detecting @pumped-fn/core-next imports
version: 1.0.0
---

# Pumped-fn TypeScript Skill

## Overview

Ensures high-quality, consistent TypeScript code when using `@pumped-fn/core-next` through automatic pattern checking and example-driven guidance.

**Core principle:** Enforce type safety, guide dependency patterns, reference canonical examples.

**Auto-activates when:** Code contains `import ... from '@pumped-fn/core-next'` or `from "@pumped-fn/core-next"`

## Detection Logic

When you detect pumped-fn usage:
1. Scan imports for `@pumped-fn/core-next`
2. Identify context: new project, integration, or extension
3. Load pattern reference for quick lookups
4. Apply 3-tier pattern checking as you write/review code

## Three-Tier Pattern Enforcement

### Tier 1: Critical (Block/require fixes)

These patterns MUST be followed. Violations prevent proceeding until fixed.

**Type Safety**
- ❌ No `any` types
- ❌ No `unknown` without proper type guards
- ❌ No type casting (`as Type`)
- ✅ Use derive() for type propagation
- ✅ Leverage factory function destructuring
- ✅ Let TypeScript infer from graph structure

**Reference**: `examples/type-inference.ts`

**Dependency Modifiers**
- ✅ `.reactive()` - downstream re-executes on upstream changes (declare on consumer side)
- ✅ `.lazy()` - conditional dependency resolution (only resolves when accessed)
- ✅ `.static()` - controller/updater pattern (doesn't re-execute on changes)
- ❌ Missing modifier when reactivity needed
- ❌ Wrong modifier for use case

**References**:
- `.reactive()`: `examples/reactive-updates.ts`
- `.lazy()`: `examples/flow-composition.ts`
- `.static()`: `examples/scope-lifecycle.ts`

**Tag System**
- ✅ Define tags with explicit types using tag() helper
- ✅ Type-safe tag references across graph
- ❌ String-based tag references
- ❌ Inconsistent tag usage

**Reference**: `examples/tags-foundation.ts`

**Lifecycle Separation**
- ✅ Long-running resources (DB, servers) in scope
- ✅ Short-span operations (requests, transactions) in flows
- ❌ Request-specific data in scope
- ❌ Connection pools in flows

**References**:
- Scope: `examples/scope-lifecycle.ts`
- Flow: `examples/flow-composition.ts`

### Tier 2: Important (Strong warnings)

These patterns should be followed. Warn clearly but allow override with justification.

**Flow Patterns**
- Root context for flow-specific data
- Proper sub-flow execution (sequential vs parallel)
- Flow disposal for cleanup
- Transaction management per flow

**References**:
- Context: `examples/flow-composition.ts`
- Transactions: `examples/database-transaction.ts`

**Meta Usage**
- Proper decoration of executors with metadata
- Scope configuration via meta
- Flow configuration via meta
- Extension configuration

**Reference**: `examples/extension-logging.ts`

**Extension Decisions**
- Use extensions for cross-cutting concerns (logging, metrics, transactions)
- Use regular executors for domain logic
- Extension lifecycle hooks (scope/flow/executor)

**Reference**: `examples/extension-logging.ts`

### Tier 3: Best Practices (Educational)

Suggest improvements when detected, but don't block.

**Testing Patterns**
- Graph swapping for mocks
- Test-specific scope configuration
- Isolated test setups

**Reference**: `examples/testing-setup.ts`

**Code Organization**
- Logical executor grouping
- Clear dependency structure
- Consistent naming

**Error Handling**
- Error boundaries
- Type-safe error propagation

**Reference**: `examples/error-handling.ts`

## Guidance Flow

When writing or reviewing pumped-fn code:

1. **Scan for violations**
   - Check Tier 1 patterns first
   - Then Tier 2
   - Finally Tier 3

2. **Provide guidance**
   - **Tier 1 violation**: Block with clear explanation + reference to example
   - **Tier 2 violation**: Strong warning with explanation + example reference
   - **Tier 3 opportunity**: Suggest improvement with example reference

3. **Reference examples**
   - Always point to specific example file
   - Quote relevant code sections from examples
   - Explain why pattern matters (graph implications)

4. **Allow overrides**
   - If user provides good justification
   - Explain trade-offs clearly
   - Document decision

## Context Detection

Detect which scenario user is in:

**New Project**
- No existing pumped-fn code
- Guide scope setup first
- Reference: `examples/basic-handler.ts` → `examples/scope-lifecycle.ts`

**Integration**
- Existing codebase, adding pumped-fn
- Guide gradual adoption
- Show how to integrate with existing patterns

**Extension**
- Existing pumped-fn code
- Adding new executors/flows
- Ensure consistency with existing graph

## Focus Areas (Common Pain Points)

### 1. Conceptual Model

**Challenge**: Graph resolution vs imperative/OOP thinking

**Guidance**:
- Executors declare factory functions, not values
- Dependencies declared explicitly, resolved by scope
- Think in terms of dependency graphs, not call chains
- Scope actualizes the graph (detects deps, resolves in order)

**Reference**: `examples/basic-handler.ts` for simplest mental model

### 2. Dependency Declaration

**Challenge**: Understanding upstream relationships and modifiers

**Guidance**:
- Upstream dependencies declared in factory function parameters
- Modifiers control resolution behavior:
  - `.reactive()`: consumer re-executes when producer changes
  - `.lazy()`: only resolve when accessed
  - `.static()`: never re-execute (controllers/updaters)
- Default behavior: resolve once, cache forever

**References**:
- Basic: `examples/basic-handler.ts`
- Reactive: `examples/reactive-updates.ts`
- Lazy: `examples/flow-composition.ts`
- Static: `examples/scope-lifecycle.ts`

### 3. Type Inference

**Challenge**: Maintaining strict types through graph without escape hatches

**Guidance**:
- Use derive() to propagate types from factories
- Destructure factory functions for better inference
- Let graph structure inform types
- Never use `any`, `unknown` without guards, or `as` casting

**Reference**: `examples/type-inference.ts`

## Quick Pattern Lookup

For detailed pattern mapping, see: `pattern-reference.md`

Common lookups:
- "How do I make this reactive?" → `examples/reactive-updates.ts`
- "Where do I put DB connection?" → `examples/scope-lifecycle.ts`
- "How do I handle requests?" → `examples/flow-composition.ts`
- "How do I maintain types?" → `examples/type-inference.ts`
- "How do I use tags?" → `examples/tags-foundation.ts`
- "How do I test this?" → `examples/testing-setup.ts`
- "How do I add logging?" → `examples/extension-logging.ts`

## Key Behaviors

- **Non-intrusive**: Only activate on detected usage
- **Example-driven**: Always reference concrete code
- **Type-focused**: Relentless about maintaining inference
- **Conceptual**: Explain *why* patterns matter (graph implications)
- **Pragmatic**: Allow overrides with good justification

## Remember

- Examples live in `examples/` directory - read them when needed
- Pattern reference provides quick mapping
- Focus on Tier 1 (critical) first
- Explain graph implications, not just syntax
- Point to docs for deep dives: `/home/lagz0ne/dev/pumped-fn/docs/`
```

**Step 2: Verify SKILL.md created**

Run: `cat /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/SKILL.md | head -30`
Expected: Skill frontmatter and overview visible

**Step 3: Commit skill creation**

```bash
cd /home/lagz0ne/.config/superpowers/skills
git add skills/libraries/pumped-fn-typescript/
git commit -m "feat: add pumped-fn typescript skill with canonical examples"
```

---

## Task 5: Test Skill Detection

**Files:**
- Read: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/SKILL.md`
- Test with: `/home/lagz0ne/dev/pumped-fn/examples/http-server/basic-handler.ts`

**Step 1: Verify skill is in skills list**

Run: `/home/lagz0ne/.config/superpowers/skills/skills/using-skills/find-skills pumped`
Expected: Shows pumped-fn-typescript skill

**Step 2: Read a pumped-fn example file**

Read: `/home/lagz0ne/dev/pumped-fn/examples/http-server/basic-handler.ts`
Expected: Contains `import ... from '@pumped-fn/core-next'`

**Step 3: Manually verify skill would activate**

Check if code contains:
- `import { ... } from '@pumped-fn/core-next'`
- Or `from "@pumped-fn/core-next"`

Expected: Detection pattern matches

---

## Task 6: Test Tier 1 Pattern Checking

**Files:**
- Create: `/tmp/pumped-fn-test-violations.ts`

**Step 1: Create test file with Tier 1 violations**

```typescript
import { executor, createScope } from '@pumped-fn/core-next'

// Violation: using 'any'
const badExecutor = executor(() => {
  return {} as any
})

// Violation: missing .reactive() when reactivity needed
const counter = executor(() => ({ count: 0 }))
const display = executor((cnt) => {
  return `Count: ${cnt.count}`
}, [counter]) // Should be [counter.reactive()]

// Violation: string-based tag instead of typed tag
const tagged = executor(() => 'value').tag('myTag')
```

**Step 2: Apply skill patterns to this code**

Verify skill would catch:
- ✅ `as any` usage → Tier 1 violation (type safety)
- ✅ Missing `.reactive()` → Tier 1 violation (dependency modifiers)
- ✅ String tag → Tier 1 violation (tag system)

**Step 3: Document expected guidance**

For each violation, skill should:
1. Block with clear explanation
2. Reference relevant example
3. Show correct pattern

---

## Task 7: Test Tier 2 Pattern Checking

**Files:**
- Create: `/tmp/pumped-fn-test-warnings.ts`

**Step 1: Create test file with Tier 2 issues**

```typescript
import { executor, createScope, flow } from '@pumped-fn/core-next'

// Issue: flow pattern not following best practice
const myFlow = flow(async (scope) => {
  // Missing: root context setup
  // Missing: proper sub-flow management
  // Missing: disposal
  return 'done'
})

// Issue: unclear extension vs executor decision
const logger = executor(() => {
  return (msg: string) => console.log(msg)
})
// Should this be an extension instead?
```

**Step 2: Verify skill provides strong warnings**

Skill should:
- Warn about missing flow patterns
- Suggest extension pattern for cross-cutting concerns
- Reference `examples/flow-composition.ts` and `examples/extension-logging.ts`
- Allow override with justification

---

## Task 8: Update Skills Wiki

**Files:**
- Modify: `/home/lagz0ne/.config/superpowers/skills/skills/using-skills/find-skills`

**Step 1: Verify skill appears in find-skills output**

Run: `/home/lagz0ne/.config/superpowers/skills/skills/using-skills/find-skills`
Expected: pumped-fn-typescript skill listed

**Step 2: If not auto-detected, check find-skills implementation**

The skill should auto-detect based on directory structure. If manual registration needed, follow existing pattern.

---

## Task 9: Test with Real Pumped-fn Code

**Files:**
- Test with: `/home/lagz0ne/dev/pumped-fn/examples/http-server/type-inference.ts`

**Step 1: Read existing example**

Read: `/home/lagz0ne/dev/pumped-fn/examples/http-server/type-inference.ts`

**Step 2: Verify skill would recognize good patterns**

Check that skill recognizes:
- ✅ Proper type inference usage
- ✅ Correct dependency declarations
- ✅ No violations

**Step 3: Create intentional violation**

Temporarily add `as any` to the file, verify skill would catch it.

---

## Task 10: Documentation and Finalization

**Files:**
- Create: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/README.md`

**Step 1: Create README for skill users**

```markdown
# Pumped-fn TypeScript Skill

Auto-activating skill for `@pumped-fn/core-next` that ensures type-safe, pattern-consistent code.

## What it does

- Detects `@pumped-fn/core-next` imports
- Enforces type safety (no `any`/`unknown`/casting)
- Guides dependency modifier usage (`.reactive()`, `.lazy()`, `.static()`)
- Ensures proper tag system usage
- Separates scope vs flow lifecycle
- References canonical examples from `/examples`

## How it works

The skill automatically activates when it detects pumped-fn imports. It applies 3-tier pattern checking:

1. **Tier 1 (Critical)**: Blocks until fixed - type safety, dependency modifiers, tags, lifecycle
2. **Tier 2 (Important)**: Strong warnings - flow patterns, meta usage, extensions
3. **Tier 3 (Best Practices)**: Educational suggestions - testing, organization, error handling

## Examples

All guidance references canonical examples in `examples/`:
- `basic-handler.ts` - Simple patterns
- `type-inference.ts` - Type safety
- `reactive-updates.ts` - Reactivity
- `scope-lifecycle.ts` - Long-running resources
- `flow-composition.ts` - Short-span operations
- `tags-foundation.ts` - Tag system
- And 7 more...

## Pattern Reference

See `pattern-reference.md` for quick pattern → example mapping.

## Focus Areas

The skill focuses on the three hardest concepts:
1. Graph resolution model (vs imperative/OOP)
2. Dependency declaration with modifiers
3. Type inference without escape hatches

## Enforcement Style

Strong suggestions with examples, but allows overrides with justification. The goal is high-quality code, not rigid rules.
```

**Step 2: Verify all files in place**

Run: `ls -la /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/`
Expected:
- SKILL.md
- pattern-reference.md
- README.md
- examples/ (with 13 .ts files + shared/)

**Step 3: Final commit**

```bash
cd /home/lagz0ne/.config/superpowers/skills
git add skills/libraries/pumped-fn-typescript/
git commit -m "docs: add README and finalize pumped-fn typescript skill"
```

---

## Execution Complete

The pumped-fn TypeScript skill is now:
- ✅ Auto-detecting on `@pumped-fn/core-next` imports
- ✅ Enforcing type safety and critical patterns
- ✅ Referencing 13 embedded canonical examples
- ✅ Providing tiered guidance (critical/important/best-practices)
- ✅ Focusing on hardest concepts (graph model, dependencies, types)

Users can now write pumped-fn code with automatic guidance ensuring consistency and quality.
