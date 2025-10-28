# Pumped-fn Agent Design

**Date:** 2025-10-28
**Status:** Design Complete, Moving to Prototype

## Overview

Build a Claude Code agent using `@anthropic-ai/claude-agent-sdk` that enforces strict pumped-fn patterns for TypeScript backend/development work. The agent embeds brainstorming workflow (ask questions → explore alternatives → validate incrementally) to ensure high-quality, consistent pumped-fn code output.

## Requirements

**Core capabilities:**
- Design systems using pumped-fn patterns
- Implement code following pumped-fn principles (TDD mandatory)
- Test implementations with pumped-fn testability patterns
- Create reusable modules using pumped-fn
- Troubleshoot pumped-fn issues

**Quality constraints:**
- Strict pumped-fn adherence (no exceptions)
- Pre-validation: analyze design before coding
- Continuous validation: check each step before proceeding
- Block non-compliant code (educate + propose alternatives)
- TDD always (test-first mandatory)
- SKILL.md mastery (all patterns, decision trees, anti-patterns)

## Architecture

**Hybrid skill approach:**
- `.claude/skills/pumped-fn-agent/SKILL.md` - Defines agent behavior
- `packages/agent/` - TypeScript implementation using pumped-fn itself

**Key insight:** Agent uses pumped-fn to build itself (dogfooding).

## Package Structure

```
packages/agent/
├── src/
│   ├── index.ts                     // Library exports
│   ├── main.ts                      // CLI entry point (scope creation)
│   ├── agent.ts                     // Claude SDK integration
│   │
│   ├── skill-knowledge.ts           // provide() - reads SKILL.md
│   ├── requirements-gatherer.ts     // derive() - question generation
│   ├── validators.ts                // derive() - pattern validation
│   │
│   ├── workflow-design.ts           // flow() - Design phase
│   ├── workflow-implement.ts        // flow() - TDD implementation
│   ├── workflow-test.ts             // flow() - Testing
│   ├── workflow-troubleshoot.ts     // flow() - Debugging
│   │
│   ├── brainstorm-questions.ts      // AskUserQuestion patterns
│   ├── brainstorm-alternatives.ts   // Generate 2-3 approaches
│   ├── brainstorm-validate.ts       // Incremental validation
│   │
│   └── utils.ts                     // Pure functions
│
├── tests/
│   ├── workflows.test.ts
│   └── validators.test.ts
│
└── package.json
```

## Brainstorming Integration

**Embedded throughout workflow:**

1. **Phase 1: Understanding** - Ask pumped-fn-specific questions
   - "What data needs to be reactive?"
   - "What operations are short-span vs long-running?"
   - "What needs to be testable in isolation?"

2. **Phase 2: Exploration** - Always propose 2-3 pumped-fn architectures
   - Use AskUserQuestion for structured choice presentation
   - Show trade-offs for each approach

3. **Phase 3: Incremental Validation** - Present design in sections
   - 200-300 words per section
   - Validate each before proceeding

## Core Workflows

### Design Workflow

```typescript
// packages/agent/src/workflow-design.ts
import { flow } from '@pumped-fn/core-next'
import { skillKnowledge } from './skill-knowledge'
import { requirementsGatherer } from './requirements-gatherer'

export const designSystemWorkflow = flow(
  { knowledge: skillKnowledge, gatherer: requirementsGatherer },
  ({ knowledge, gatherer }, request: string) => async (ctx) => {

    const questions = await ctx.run('get-questions', () =>
      gatherer.getPumpedFnQuestions()
    )

    const requirements = await ctx.run('gather-requirements', async () => {
      return await askUserQuestions(questions)
    })

    const approaches = await ctx.run('generate-approaches', () =>
      generatePumpedFnApproaches(requirements)
    )

    const selected = await ctx.run('user-selects-approach', async () => {
      return await askUserChoice(approaches)
    })

    const sections = ['data-flow', 'scope-hierarchy', 'error-handling']
    for (const section of sections) {
      await ctx.run(`design-${section}`, async () => {
        const design = generateDesignSection(section, selected)
        return await validateWithUser(design)
      })
    }

    return { success: true as const, design: selected }
  }
)
```

**Usage:**
```typescript
// packages/agent/src/main.ts
const scope = createScope()
const result = await scope.exec(designSystemWorkflow, 'build user auth')
```

**Testing:**
```typescript
// packages/agent/tests/workflows.test.ts
const scope = createScope()
const result = await scope.exec(designSystemWorkflow, 'build auth')
expect(result.success).toBe(true)
```

### Validation Workflow

```typescript
// packages/agent/src/validators.ts
import { derive } from '@pumped-fn/core-next'
import { skillKnowledge } from './skill-knowledge'

export const codeValidator = derive(
  skillKnowledge,
  (knowledge) => ({
    checkAntiPatterns: (code: string) => {
      const violations = []

      if (code.includes('new Promise(')) {
        violations.push('ANTI-PATTERN: Promise constructor - use async/await')
      }

      if (code.match(/provide\([^)]*,[^)]*\)/)) {
        violations.push('ANTI-PATTERN: provide() takes no dependencies - use derive()')
      }

      if (code.includes('createScope()') && !code.includes('main.ts')) {
        violations.push('ANTI-PATTERN: createScope() should be in main/test only')
      }

      return violations
    },

    validateFlowSignature: (code: string) => {
      const hasCorrectSignature = /flow\([^,]+,\s*\([^)]+\)\s*=>\s*async\s*\(ctx\)/.test(code)
      return hasCorrectSignature
    }
  })
)
```

## Executor Export Pattern

**All files export executors (provide/derive/flow):**
- Scope creation happens at interaction points (main.ts, tests)
- Use `scope.exec(flow, param)` to execute flows
- Use `scope.resolve(executor).map(...)` for resources

**Example:**
```typescript
// Export executor
export const myFlow = flow(deps, (resolved, param) => async (ctx) => {...})

// Caller creates scope and executes
const scope = createScope()
await scope.exec(myFlow, param)
```

## Next Steps

1. **Prototype validation approach** - Test if anti-pattern detection works
2. Complete remaining design sections (data flow, testing strategy)
3. Set up worktree for implementation
4. Create detailed implementation plan
