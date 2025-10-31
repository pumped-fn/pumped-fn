# Pumped-Design Sub-Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive sub-skill architecture for pumped-design skill covering construction patterns, framework integration, testing strategies, and troubleshooting workflows.

**Architecture:** Main SKILL.md routes to sub-skills via frontmatter-based pattern matching. Each sub-skill is self-contained with tags, description, code templates, real examples from tests, and troubleshooting. AI reads frontmatter first to decide relevance, then loads full content.

**Tech Stack:** Markdown with YAML frontmatter, code examples from pumped-fn tests

---

## Task 1: Update Main SKILL.md with Sub-skill Routing

**Files:**
- Modify: `.claude/skills/pumped-design/SKILL.md`

**Step 1: Add sub-skill routing table after overview**

Insert after the "When to Use This Skill" section:

```markdown
## Sub-skill Reference System

**AI Workflow:**
1. User asks question/requests action
2. AI scans routing table below for matching tags/descriptions
3. AI reads sub-skill frontmatter (tags, description)
4. AI decides relevance, loads full content if needed
5. AI applies patterns from sub-skill(s)

**MANDATORY: Load `coding-standards.md` before writing any code.**

### Sub-skill Routing Table

| Sub-skill | Tags | When to Load | File |
|-----------|------|--------------|------|
| **Coding Standards** | coding, types, naming, style | Before writing code, reviewing code | references/coding-standards.md |
| **Resource: Basic** | resource, add, config, lifecycle | Adding standalone resource with config | references/resource-basic.md |
| **Resource: Derived** | resource, add, dependencies, derive | Resource depending on other resources | references/resource-derived.md |
| **Resource: Lazy** | resource, add, lazy, conditional | Conditional resolution with .lazy modifier | references/resource-lazy.md |
| **Flow: Sub-flows** | flow, add, reuse, orchestration | Flow calling other flows | references/flow-subflows.md |
| **Flow: Context** | flow, modify, ctx.run, ctx.exec | Reading/writing execution context | references/flow-context.md |
| **Integration: Hono** | integration, add, hono, http | Setting up Hono server | references/integration-hono.md |
| **Integration: Next.js** | integration, add, nextjs, ssr | Integrating with Next.js | references/integration-nextjs.md |
| **Integration: TanStack** | integration, add, tanstack, router | TanStack Start integration | references/integration-tanstack.md |
| **Testing: Utilities** | testing, util, unit, preset | Unit testing utilities | references/testing-utilities.md |
| **Testing: Flows** | testing, flow, integration, branches | Integration testing flows | references/testing-flows.md |
| **Testing: Integration** | testing, integration, e2e | End-to-end integration testing | references/testing-integration.md |
| **Extension: Basics** | extension, add, cross-cutting, wrap | Creating extensions | references/extension-basics.md |
| **Entrypoint: Patterns** | entrypoint, add, scope, lifecycle | Structuring entrypoints | references/entrypoint-patterns.md |

**Usage Examples:**

- User: "How do I add a database resource?" → Load `resource-basic.md`
- User: "My flow cleanup isn't working" → Load `flow-context.md`, `resource-basic.md`
- User: "How to integrate with Hono?" → Load `coding-standards.md`, `integration-hono.md`
- User: "Writing tests for my flow" → Load `coding-standards.md`, `testing-flows.md`
```

**Step 2: Verify file structure**

Run: `ls -la .claude/skills/pumped-design/`

Expected: SKILL.md exists

**Step 3: Commit**

```bash
git add .claude/skills/pumped-design/SKILL.md
git commit -m "feat(pumped-design): add sub-skill routing table"
```

---

## Task 2: Create references/ Directory and Coding Standards

**Files:**
- Create: `.claude/skills/pumped-design/references/`
- Create: `.claude/skills/pumped-design/references/coding-standards.md`

**Step 1: Create references directory**

Run: `mkdir -p .claude/skills/pumped-design/references`

**Step 2: Create coding-standards.md with frontmatter and content**

```markdown
---
name: coding-standards
tags: coding, types, naming, organization, style, readability, economy, narrowing
description: Type safety rules, file organization, variable naming, code economy principles. Type narrowing with discriminated unions mandatory - never use any/casting, prefer unknown and inference. Flat file structure with component-type prefixes. Functional naming without suffixes. Lines of code are expensive - maximize TypeScript features without reducing readability. Destructuring to reduce verbosity.
---

# Coding Standards for Pumped-fn Applications

## Type Safety Rules

### Never `any` Unless Type Inference Requires It

```typescript
// ✅ Prefer unknown
const parseInput = (raw: unknown) => {
  if (typeof raw === 'string') {
    return JSON.parse(raw)
  }
  throw new Error('Invalid input')
}

// ❌ Avoid any
const parseInput = (raw: any) => {  // Lost type safety
  return JSON.parse(raw)
}
```

### Think Twice Before Type Casting

```typescript
// ✅ Let types flow naturally
const result = await ctx.exec(validateOrder, input)
if (!result.success) {
  // TypeScript knows result has 'reason' property
  return result
}

// ❌ Don't cast when narrowing works
const result = await ctx.exec(validateOrder, input)
if (!result.success) {
  return result as ValidationError  // Unnecessary
}
```

### Internal Code Uses Type Inference

```typescript
// ✅ Let TypeScript infer flow types
export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input) => {  // Types inferred from usage
      const validated = await ctx.exec(validateOrder, input)
      return validated
    }
)

// ❌ Don't explicitly type internals
export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx: FlowContext, input: OrderInput): Promise<OrderResult> => {
      // Verbose, types already known
    }
)
```

### Library Exports Use Explicit Interfaces

```typescript
// ✅ Export clean interface for reusable components
export type Logger = {
  info: (msg: string, meta?: Record<string, unknown>) => void
  error: (msg: string, meta?: Record<string, unknown>) => void
}

export const logger = provide((controller): Logger => {
  const pino = createPino({ ... })

  controller.cleanup(() => pino.flush())

  return {
    info: (msg, meta) => pino.info(meta, msg),
    error: (msg, meta) => pino.error(meta, msg)
  }
})

// ❌ Don't expose library types directly
export const logger = provide((controller): pino.Logger => {
  // Exposes pino's complex interface
})
```

---

## Type Narrowing is Fundamental

**Principle:** Design discriminated unions, use TypeScript's type narrowing. Never cast when narrowing works.

### Discriminated Unions with Type Narrowing

```typescript
export namespace ProcessOrder {
  export type Success = { success: true; orderId: string; total: number }
  export type ValidationError = { success: false; reason: 'INVALID_ITEMS' }
  export type PaymentError = { success: false; reason: 'PAYMENT_DECLINED'; message: string }

  export type Result = Success | ValidationError | PaymentError
}

export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input): Promise<ProcessOrder.Result> => {
      const validated = await ctx.exec(validateOrder, input)

      // ✅ Type narrowing via discriminator
      if (!validated.success) {
        // TypeScript knows: validated is ValidationError here
        // validated.reason exists
        return validated
      }

      // ✅ After check, TypeScript knows validated.success is true
      // TypeScript knows: validated.orderId, validated.total exist
      const charged = await ctx.exec(chargePayment, {
        amount: validated.total
      })

      if (!charged.success) {
        // TypeScript knows: charged has 'reason' property
        return charged
      }

      // TypeScript knows: charged.transactionId exists
      return { success: true, orderId: charged.transactionId, total: charged.amount }
    }
)
```

### Trust Narrowing - No Optional Chaining After Checks

```typescript
// ✅ After narrowing, don't use optional chaining
if (validated.success) {
  const id = validated.orderId.toString()  // Correct - narrowing proves it exists
}

// ❌ Don't use optional when narrowing guarantees
if (validated.success) {
  const id = validated.orderId?.toString()  // Wrong - ? is redundant
}
```

### Key Type Narrowing Patterns

1. **Always use discriminated unions** - `success: true/false`, `type: 'A' | 'B'`
2. **Let TypeScript narrow** - `if (!result.success)` eliminates error branches
3. **Avoid type assertions** - If you need `as`, your types are wrong
4. **Trust narrowing** - After check, TypeScript knows the exact type

---

## File Organization

**Principle:** Flat structure with component-type prefixes for sorting and shorter imports.

### Flat Structure with Prefixes

```
src/
  entrypoint.cli.ts
  entrypoint.web.ts
  entrypoint.test.ts
  flow.order.ts
  flow.payment.ts
  flow.user.ts
  resource.db.ts
  resource.logger.ts
  resource.cache.ts
  util.datetime.ts
  util.validation.ts
  util.crypto.ts
```

**Benefits:**
- Prefix-based alphabetical sorting (all `flow.*` together)
- Shorter import paths: `./flow.order` vs `./flows/order`
- Clear layer membership at a glance
- Easy globbing: `flow.*.ts`, `resource.*.ts`

### Test Files Adjacent to Source

```
src/
  flow.order.ts
  flow.order.test.ts
  util.datetime.ts
  util.datetime.test.ts
```

---

## Variable Naming

**Principle:** Functional naming - no prefixes or suffixes.

```typescript
// ✅ Clean functional names
const user = await findUser(id)
const validated = validate(input)
const dbPool = provide(...)
const logger = provide(...)

// ❌ Avoid redundant prefixes/suffixes
const validatedUser = validate(input)     // "validated" is redundant
const dbPoolResource = provide(...)        // "Resource" suffix is noise
const loggerService = provide(...)         // "Service" suffix adds nothing
```

---

## Code Economy

**Principle:** Lines of code are expensive. Think once on meaning, think twice before adding a line. Maximize TypeScript language features without reducing readability.

### Use Language Features

```typescript
// ✅ Ternary for simple branches
const status = validated.success ? 'ok' : 'error'

// ✅ Optional chaining
const email = user?.contact?.email

// ✅ Nullish coalescing
const port = config.port ?? 3000

// ✅ Combine operations when meaningful
return validated.success
  ? ctx.exec(chargePayment, { amount: validated.total })
  : validated

// ✅ Inline when clear
return ctx.exec(charge, { userId: input.userId })
```

### Avoid Unnecessary Variables

```typescript
// ❌ Don't create redundant variables
const isSuccess = validated.success
if (isSuccess) { ... }

// ✅ Use the value directly
if (validated.success) { ... }

// ❌ Don't split unnecessarily
const userId = input.userId
return ctx.exec(charge, { userId })

// ✅ Inline when meaningful
return ctx.exec(charge, { userId: input.userId })
```

**Balance:** Reduce lines, preserve clarity. If removing a line makes code harder to understand, keep it.

---

## Destructuring for Conciseness

```typescript
// ✅ Destructure dependencies
const userRepo = derive(
  { db: dbPool, logger },
  ({ db, logger }) => ({
    findById: async (id: string) => {
      logger.info('Finding user', { id })
      return db.query('SELECT * FROM users WHERE id = $1', [id])
    }
  })
)

// ✅ Destructure in flows
const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input) => {
      const validated = await ctx.exec(validateOrder, input)
      if (!validated.success) return validated

      return ctx.exec(chargePayment, { amount: validated.total })
    }
)
```

---

## Blank Lines for Readability

**Principle:** Separate logical blocks with blank lines.

```typescript
// ✅ Blank lines separate logical operations
export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input) => {
      const validated = await ctx.exec(validateOrder, input)

      if (!validated.success) {
        return validated
      }

      const charged = await ctx.exec(chargePayment, {
        userId: input.userId,
        amount: validated.total
      })

      if (!charged.success) {
        return charged
      }

      return ctx.run('finalize', () => ({
        success: true,
        orderId: charged.id
      }))
    }
)
```

---

## Promised Chaining Rules

**Principle:** Chain `.map()`/`.mapError()` to complete logical operations, not as default style.

### Chain When Completing Logical Operation

```typescript
// ✅ Chain to transform and handle errors
const validated = await ctx.exec(validateOrder, input)
  .map((result) => {
    if (!result.success) throw new Error(result.reason)
    return result
  })
  .mapError((err) => ({
    success: false,
    reason: 'VALIDATION_FAILED'
  }))

// ✅ Also OK: Separate when clearer
const validated = await ctx.exec(validateOrder, input)

if (!validated.success) {
  return { success: false, reason: 'VALIDATION_FAILED' }
}
```

### Don't Chain Just Because You Can

```typescript
// ❌ Meaningless chain
const result = await ctx.exec(validate, input)
  .map((r) => r)  // Does nothing

// ✅ Only chain when transforming
const result = await ctx.exec(validate, input)
```

**Guideline:** Use `.map()`/`.mapError()` when you need to transform or complete error handling, not by default.

---

## Summary

**Type Safety:**
- Never `any`, prefer `unknown`
- No casting - use type narrowing
- Inference for internals, explicit for exports
- Discriminated unions mandatory

**Organization:**
- Flat files with prefixes
- Functional naming
- Adjacent tests

**Code Quality:**
- Lines are expensive
- Maximize language features
- Preserve readability
- Blank lines separate logic
- Destructure for conciseness
- Chain when meaningful
```

**Step 3: Verify file created**

Run: `cat .claude/skills/pumped-design/references/coding-standards.md | head -20`

Expected: See frontmatter with tags

**Step 4: Commit**

```bash
git add .claude/skills/pumped-design/references/
git commit -m "feat(pumped-design): add coding standards sub-skill"
```

---

## Task 3: Create Resource Sub-skills

**Files:**
- Create: `.claude/skills/pumped-design/references/resource-basic.md`
- Create: `.claude/skills/pumped-design/references/resource-derived.md`
- Create: `.claude/skills/pumped-design/references/resource-lazy.md`

**Step 1: Read pumped-fn templates for resource patterns**

Run: `cat .claude/skills/pumped-fn/references/templates.md | grep -A 100 "Template 1: Resource Layer"`

Expected: See resource code examples

**Step 2: Create resource-basic.md**

Content structure:
- Frontmatter with tags
- When to use
- Code template
- Real example from pumped-fn tests
- Troubleshooting common issues
- Related sub-skills

**Step 3: Create resource-derived.md**

Similar structure, focus on `derive()` pattern with dependencies

**Step 4: Create resource-lazy.md**

Focus on conditional/lazy resource loading patterns

**Step 5: Verify files**

Run: `ls -la .claude/skills/pumped-design/references/resource-*.md`

Expected: 3 files

**Step 6: Commit**

```bash
git add .claude/skills/pumped-design/references/resource-*.md
git commit -m "feat(pumped-design): add resource sub-skills (basic/derived/lazy)"
```

---

## Task 4: Create Flow Sub-skills

**Files:**
- Create: `.claude/skills/pumped-design/references/flow-subflows.md`
- Create: `.claude/skills/pumped-design/references/flow-context.md`

**Step 1: Read flow patterns from pumped-fn**

Run: `cat .claude/skills/pumped-design/references/templates.md | grep -A 100 "Template 3: Flow Layer"`

Expected: See flow examples

**Step 2: Read flow tests for correct ctx.exec usage**

Run: `cat packages/next/tests/flow-expected.test.ts | grep -A 20 "ctx.exec"`

Expected: See sub-flow patterns

**Step 3: Create flow-subflows.md**

Cover:
- `ctx.exec(subFlow, input)` pattern (no `ctx.run()` wrapper)
- Error mapping from sub-flows
- Discriminated union outputs
- Reusable vs non-reusable flows

**Step 4: Create flow-context.md**

Cover:
- `ctx.run('step-id', () => ...)` for direct operations
- `ctx.parallel()` for concurrent execution
- `ctx.parallelSettled()` for partial failures
- Reading/writing context

**Step 5: Verify files**

Run: `ls -la .claude/skills/pumped-design/references/flow-*.md`

Expected: 2 files

**Step 6: Commit**

```bash
git add .claude/skills/pumped-design/references/flow-*.md
git commit -m "feat(pumped-design): add flow sub-skills (subflows/context)"
```

---

## Task 5: Create Integration Sub-skills

**Files:**
- Create: `.claude/skills/pumped-design/references/integration-hono.md`
- Create: `.claude/skills/pumped-design/references/integration-nextjs.md`
- Create: `.claude/skills/pumped-design/references/integration-tanstack.md`

**Step 1: Read environment integration patterns**

Run: `cat .claude/skills/pumped-fn/references/environments.md | head -100`

Expected: See framework integration examples

**Step 2: Create integration-hono.md**

Cover:
- Entrypoint setup
- Scope creation
- Route handlers calling flows via `scope.exec()`
- Request → flow input transformation
- Flow result → HTTP response mapping

**Step 3: Create integration-nextjs.md**

Cover:
- Server Actions integration
- API Routes with scope
- Middleware patterns

**Step 4: Create integration-tanstack.md**

Cover:
- TanStack Start loader/action patterns
- Scope lifecycle in SSR

**Step 5: Verify files**

Run: `ls -la .claude/skills/pumped-design/references/integration-*.md`

Expected: 3 files

**Step 6: Commit**

```bash
git add .claude/skills/pumped-design/references/integration-*.md
git commit -m "feat(pumped-design): add integration sub-skills (hono/nextjs/tanstack)"
```

---

## Task 6: Create Testing Sub-skills

**Files:**
- Create: `.claude/skills/pumped-design/references/testing-utilities.md`
- Create: `.claude/skills/pumped-design/references/testing-flows.md`
- Create: `.claude/skills/pumped-design/references/testing-integration.md`

**Step 1: Read testing patterns from pumped-fn**

Run: `cat .claude/skills/pumped-fn/references/templates.md | grep -A 100 "Template 6: Test Fixtures"`

Expected: See preset() patterns

**Step 2: Create testing-utilities.md**

Cover:
- Unit testing pure functions
- Testing executor-wrapped built-ins with `preset()`
- Edge cases and boundary conditions

**Step 3: Create testing-flows.md**

Cover:
- Integration testing flows
- `preset()` for mocking dependencies
- Testing ALL output branches (Success + each Error)
- Difference between reusable flows (test standalone) vs non-reusable flows (test via parent)

**Step 4: Create testing-integration.md**

Cover:
- End-to-end testing patterns
- Real resource testing (test DB, etc.)
- When to use integration vs unit tests

**Step 5: Verify files**

Run: `ls -la .claude/skills/pumped-design/references/testing-*.md`

Expected: 3 files

**Step 6: Commit**

```bash
git add .claude/skills/pumped-design/references/testing-*.md
git commit -m "feat(pumped-design): add testing sub-skills (utilities/flows/integration)"
```

---

## Task 7: Create Extension and Entrypoint Sub-skills

**Files:**
- Create: `.claude/skills/pumped-design/references/extension-basics.md`
- Create: `.claude/skills/pumped-design/references/entrypoint-patterns.md`

**Step 1: Read extension patterns**

Run: `cat .claude/skills/pumped-fn/references/templates.md | grep -A 100 "Template 7: Extensions"`

Expected: See wrap() examples

**Step 2: Create extension-basics.md**

Cover:
- Creating extensions with `wrap()`
- `execute` and `journal` hooks
- Cross-cutting concerns (logging, metrics, tracing)
- Extension composition

**Step 3: Read entrypoint patterns**

Run: `cat .claude/skills/pumped-fn/references/templates.md | grep -A 100 "Template 5: Main Entry"`

Expected: See scope creation patterns

**Step 4: Create entrypoint-patterns.md**

Cover:
- Scope creation with tags and extensions
- Environment-specific initialization
- Graceful shutdown
- CLI vs HTTP vs Lambda patterns

**Step 5: Verify files**

Run: `ls -la .claude/skills/pumped-design/references/extension-*.md .claude/skills/pumped-design/references/entrypoint-*.md`

Expected: 2 files

**Step 6: Commit**

```bash
git add .claude/skills/pumped-design/references/extension-basics.md .claude/skills/pumped-design/references/entrypoint-patterns.md
git commit -m "feat(pumped-design): add extension and entrypoint sub-skills"
```

---

## Task 8: Update Design Document

**Files:**
- Modify: `docs/plans/2025-10-30-pumped-design-pattern.md`

**Step 1: Add sub-skill architecture section**

Insert after "Implementation Plan" section:

```markdown
## Sub-skill Architecture

The pumped-design skill uses a two-layer approach:

**Layer 1: Main SKILL.md**
- Brainstorming-based design process
- Sub-skill routing table with tags and descriptions
- AI reads descriptions to decide which sub-skills to load

**Layer 2: Sub-skills (references/*.md)**
- Each sub-skill has YAML frontmatter (tags, description)
- AI reads frontmatter first to assess relevance
- Full content includes: patterns, code templates, real examples, troubleshooting

**Sub-skills created:**
- `coding-standards.md` - Type safety, naming, organization (load before writing code)
- `resource-basic.md` - Standalone resources with config/lifecycle
- `resource-derived.md` - Resources with dependencies
- `resource-lazy.md` - Lazy/conditional resource loading
- `flow-subflows.md` - Flow orchestration with sub-flows
- `flow-context.md` - Context operations (ctx.run, ctx.exec)
- `integration-hono.md` - Hono server integration
- `integration-nextjs.md` - Next.js integration
- `integration-tanstack.md` - TanStack Start integration
- `testing-utilities.md` - Unit testing utilities
- `testing-flows.md` - Integration testing flows
- `testing-integration.md` - End-to-end testing
- `extension-basics.md` - Creating extensions
- `entrypoint-patterns.md` - Entrypoint structure

**AI Workflow:**
1. User asks question
2. AI scans routing table for relevant tags/descriptions
3. AI loads sub-skill frontmatter
4. AI loads full content if relevant
5. AI applies patterns
```

**Step 2: Verify update**

Run: `grep "Sub-skill Architecture" docs/plans/2025-10-30-pumped-design-pattern.md`

Expected: Section found

**Step 3: Commit**

```bash
git add docs/plans/2025-10-30-pumped-design-pattern.md
git commit -m "docs(pumped-design): document sub-skill architecture"
```

---

## Task 9: Verification and Documentation

**Step 1: Verify all sub-skills exist**

Run:
```bash
ls -1 .claude/skills/pumped-design/references/*.md
```

Expected output:
```
.claude/skills/pumped-design/references/coding-standards.md
.claude/skills/pumped-design/references/entrypoint-patterns.md
.claude/skills/pumped-design/references/extension-basics.md
.claude/skills/pumped-design/references/flow-context.md
.claude/skills/pumped-design/references/flow-subflows.md
.claude/skills/pumped-design/references/integration-hono.md
.claude/skills/pumped-design/references/integration-nextjs.md
.claude/skills/pumped-design/references/integration-tanstack.md
.claude/skills/pumped-design/references/resource-basic.md
.claude/skills/pumped-design/references/resource-derived.md
.claude/skills/pumped-design/references/resource-lazy.md
.claude/skills/pumped-design/references/testing-flows.md
.claude/skills/pumped-design/references/testing-integration.md
.claude/skills/pumped-design/references/testing-utilities.md
```

**Step 2: Verify frontmatter in each sub-skill**

Run:
```bash
for f in .claude/skills/pumped-design/references/*.md; do
  echo "Checking $f"
  head -5 "$f" | grep -q "^---$" && echo "✓ Has frontmatter" || echo "✗ Missing frontmatter"
done
```

Expected: All files have frontmatter

**Step 3: Create README for references directory**

Create `.claude/skills/pumped-design/references/README.md`:

```markdown
# Pumped-Design Sub-skills

This directory contains sub-skills loaded on-demand by the main pumped-design skill.

## Structure

Each sub-skill has:
- **YAML frontmatter** - name, tags, description (AI reads first)
- **Content sections** - When to use, code templates, examples, troubleshooting

## Usage

AI loads sub-skills based on user query:
1. Scans main SKILL.md routing table
2. Reads sub-skill frontmatter to assess relevance
3. Loads full content if applicable
4. Applies patterns to user's code

## Sub-skills

- `coding-standards.md` - Mandatory before writing code
- `resource-*.md` - Resource construction patterns
- `flow-*.md` - Flow orchestration and context
- `integration-*.md` - Framework integration
- `testing-*.md` - Testing strategies
- `extension-basics.md` - Cross-cutting concerns
- `entrypoint-patterns.md` - Application entry points
```

**Step 4: Final commit**

```bash
git add .claude/skills/pumped-design/references/README.md
git commit -m "docs(pumped-design): add references README"
```

**Step 5: Push to remote**

Run:
```bash
git log --oneline -10
```

Expected: See all commits from this plan

---

## Summary

**Completed:**
1. ✅ Updated main SKILL.md with sub-skill routing table
2. ✅ Created coding-standards.md (type safety, naming, organization)
3. ✅ Created resource sub-skills (basic, derived, lazy)
4. ✅ Created flow sub-skills (subflows, context)
5. ✅ Created integration sub-skills (hono, nextjs, tanstack)
6. ✅ Created testing sub-skills (utilities, flows, integration)
7. ✅ Created extension and entrypoint sub-skills
8. ✅ Updated design document
9. ✅ Verified structure and documentation

**Next Steps:**
- Populate sub-skills with actual code examples from pumped-fn tests
- Test sub-skill loading in real scenarios
- Iterate based on usage feedback
