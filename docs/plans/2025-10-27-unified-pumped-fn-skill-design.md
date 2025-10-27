# Unified Pumped-fn Skill Design

**Date:** 2025-10-27
**Status:** Design Complete
**Version:** 4.0.0

## Overview

Complete redesign of pumped-fn skills from fragmented (pumped-fn-typescript + pumped-fn-react) to unified comprehensive skill covering entire development lifecycle.

**Success criteria:**
- Auto-activate for TypeScript projects
- Guide architecture from scratch via critical questions
- Generate deterministic, zero-violation code
- Ensure 100% testable (preset pattern, no excessive mocking)
- Ensure 100% traceable (all operations journaled, extension-observable)
- Support continuous development (architecture map for navigation)
- Optimize for LLM troubleshooting (compact logs, smart extraction)

## Architecture Approach

**Selected:** Unified Core (Approach 3)

Single skill file (~2000 lines) with 8 sections:
1. Activation & Installation Guidance
2. Critical Questions Framework
3. Core API Decision Trees
4. Architecture Generation Templates
5. Environment-Specific Guidance
6. Anti-Pattern Detection & Corrections
7. Observability & Troubleshooting
8. Validation Checklist

**Rationale:**
- 90% patterns shared across environments
- Single source of truth (consistency)
- Deterministic generation via templates
- Built-in validation (zero violations)
- Manageable size with clear sections

## Section Breakdown

### Section 1: Activation & Installation

**Trigger:** Any TypeScript project (tsconfig.json OR .ts files)

**Flow:**
```
Detect TS project
  ↓
Check @pumped-fn/core-next in package.json
  ↓
  Found → Activate full guidance
  Not found → Show installation recommendation
    ↓
    User accepts → Proceed with architecture
    User declines → Skill passive (reference only)
```

**Red flags (forgot skill):**
- Architecture without executors/scope
- State management with plain classes
- Testing requiring extensive mocking
- Code very brittle, too blackbox
- No clear dependency injection

### Section 2: Critical Questions Framework

**Greenfield (new projects):**

1. **Application type** - HTTP server, CLI, cron, event processor, SPA, meta-framework, hybrid
2. **External systems** - Database, cache, APIs, queues, WebSocket, file storage, auth, email
3. **Business operations** - CRUD, workflows, validations, transformations, orchestration
4. **Testing strategy** - Unit with mocks, integration with real resources, hybrid
5. **Observability** - Basic logging, structured logging, tracing, metrics, audit trail, LLM-optimized
6. **Environment details** - Framework, deployment target, runtime

**Continuous development (existing codebases):**

1. **Change type detection** - Add feature, modify existing, fix bug, refactor, troubleshoot
2. **Dependency graph analysis** - Load `.pumped-fn/map.yaml`, identify affected components
3. **Impact analysis** - Direct consumers, indirect consumers, test files affected
4. **Regression prevention** - Risk level (high/medium/low), test commands to run
5. **Graph-guided troubleshooting** - Trace from entry point through dependencies, extract smart logs

**Architecture map (.pumped-fn/map.yaml):**
```yaml
# Ultra-compact navigation index

structure:
  resources: src/resource-*.ts
  flows: src/flow-*.ts
  api: src/api-*.ts
  utils: src/util-*.ts

critical:
  - resource-database
  - flow-auth

patterns:
  test: "*.test.ts"
  ext: src/ext-*.ts
```

**Purpose:** Keywords for agent navigation (50 tokens, not 2000)

### Section 3: Core API Decision Trees

9 decision trees for fast API selection:

1. **Component type** - Resource (provide/derive), flow, function, extension
2. **provide() vs derive()** - No deps → provide, has deps → derive
3. **flow() vs function** - Side effects/observability → flow, pure → function
4. **When .reactive** - Changes over time + others react → .reactive
5. **Scope lifecycle** - Long-running server (one scope), CLI (scope per command), Lambda (scope per invocation), React (one scope via Context)
6. **Tags vs direct values** - Runtime config → tags, constants → direct
7. **ctx.run() vs ctx.exec()** - Sub-flow → exec, direct operation → run
8. **Testing strategy** - Resource (preset or integration), flow (always preset), utility (direct unit test)
9. **Promised utilities** - Parallel success (all), partial failure (allSettled + partition), top-level error (try)

Quick reference table included for lookup.

### Section 4: Architecture Generation Templates

7 templates for deterministic code generation:

1. **Resource layer** - provide() for external systems, cleanup via controller.cleanup()
2. **Repository layer** - derive() with db dependency, CRUD operations
3. **Flow layer** - flow() with deps, discriminated unions, ctx.run/exec journaling
4. **Interaction points** - HTTP routes, CLI commands (framework-specific)
5. **Main entry point** - Scope creation, tag configuration, shutdown handlers
6. **Test fixtures** - preset() pattern, mock resources, verify discriminated unions
7. **Extensions** - Logging, tracing, metrics via wrap() hook

**All templates enforce:**
- Type safety (no any/unknown/unsafe casting)
- Journaling (ctx.run/exec with keys)
- Testability (preset-compatible)
- Observability (extension hooks)
- Coding style (flat structure, <500 lines, function-style naming)

### Section 5: Environment-Specific Guidance

Subsections for different deployment contexts:

**Backend:**
- HTTP servers (Express, Fastify, Hono) - one scope, attach to app
- CLI (Commander, Yargs) - scope per command, dispose in finally
- Cron jobs (node-cron) - one scope, shared across jobs
- Event processors (Kafka, queues) - one scope for consumer lifetime

**Frontend:**
- React SPA - one scope, provide via ScopeProvider
- Meta-frameworks (Next.js, TanStack Start) - module-level scope, inject via middleware

**Serverless:**
- Lambda - scope per invocation, dispose via scope.exec().finally()

### Section 6: Anti-Pattern Detection & Corrections

6 critical anti-patterns with automated detection:

1. **Multiple scopes** - createScope() in handlers/components/loops → One scope per app
2. **Built-ins in resources** - process.env in executors → Tag-based config
3. **Premature escape** - Early scope.resolve(), pass values → Pass scope, resolve in flows
4. **Missing journaling** - Direct async calls in flows → ctx.run/exec wrappers
5. **Type safety violations** - any/unknown/unsafe casting → Type guards
6. **Excessive mocking** - Global mocks, complex setup → preset() at resource layer

**Validation checks:**
- Grep patterns to detect violations
- Automated suggestions for corrections
- Block code delivery until zero violations

### Section 7: Observability & Troubleshooting

**Extension architecture:**
- Hooks: execute (flow lifecycle), journal (operations), resolve (resources)
- Pattern: wrap() intercepts all operations

**LLM-optimized log format (JSONL):**
```jsonl
{"t":"2025-10-27T10:30:00.123Z","type":"flow_start","flow":"createUser","cid":"req-abc"}
{"t":"2025-10-27T10:30:00.125Z","type":"op","key":"validate-email","cid":"req-abc"}
{"t":"2025-10-27T10:30:00.150Z","type":"flow_end","flow":"createUser","dur":27,"ok":true,"cid":"req-abc"}
```

**Benefits:**
- Compact field names (t, op, dur, cid) save tokens
- Correlation IDs link operations
- One event per line (easy grep)
- Full request trace in <500 tokens

**Smart log extraction workflow:**
```
Issue reported → Load map → Find relevant flow → Extract cid → grep full trace → Analyze (500 tokens) → Identify problem
```

**File structure:**
```
logs/
  flows.jsonl         # All flow executions
  errors.jsonl        # Error traces only
  performance.jsonl   # Slow operations (>100ms)
```

### Section 8: Validation Checklist

**Pre-generation:**
- Architecture map strategy
- Tags for runtime config
- Scope strategy per app type
- Discriminated union outputs
- Journaling plan
- Test strategy
- Observability extension

**Post-generation:**
- Type safety (tsc --noEmit passes)
- No process.env in executors
- Single scope (grep count)
- All flows journaled
- Tests use preset (no global mocks)
- Flat structure (no nested dirs unless >10 files)
- Files <500 lines
- Architecture map updated

**Runtime validation:**
```bash
pnpm tsc --noEmit
pnpm test
pnpm build
grep "new-component" .pumped-fn/map.yaml
```

**Zero violations guarantee:** If ANY check fails → stop, correct, re-run, only deliver when all pass.

## Coding Style Rules

Integrated throughout skill:

**File organization:**
- Flat structure with suffixes: `resource-database.ts`, `flow-user-create.ts`, `repo-user.ts`
- Only create subdirectories when >10 related files
- Default: stay flat

**File size:**
- Max 500 lines per file
- Split when approaching limit
- Re-export pattern for convenience

**Naming:**
- Function-programming style (camelCase verbs)
- Resources: `dbPool`, `redisCache`, `stripeClient`
- Repositories: `userRepo`, `postRepo`
- Flows: `createUser`, `processPayment`
- Utilities: `validateEmail`, `formatCurrency`
- Types: PascalCase (`User`, `Order`)

**Communication:**
- Sacrifice grammar for clarity
- Concise, direct, concrete
- Examples:
  - ❌ "I am going to proceed with the implementation..."
  - ✅ "Implementing user auth flow: validate credentials, create session."

## Implementation Plan

**Phase 1: Skill Creation**
1. Create `.claude/skills/pumped-fn/SKILL.md`
2. Write frontmatter (name, description, when_to_use, version, auto_activate)
3. Write all 8 sections based on this design
4. Estimated size: 1800-2200 lines

**Phase 2: Validation**
1. Test greenfield generation (generate sample HTTP server + CLI)
2. Test continuous development (simulate change to existing codebase)
3. Verify decision trees (ask questions, check deterministic output)
4. Verify anti-pattern detection (introduce violations, check catches)
5. Verify observability (generate extensions, check log format)

**Phase 3: Integration**
1. Update `.claude/skills/README.md` (add pumped-fn to list)
2. Deprecate old skills (mark pumped-fn-typescript and pumped-fn-react as superseded)
3. Update CLAUDE.md checklist (reference unified skill)
4. Update plugin.json (if publishing to marketplace)

**Phase 4: Documentation**
1. Add examples to skill (at least 3: HTTP server, CLI, React SPA)
2. Document architecture map maintenance
3. Document troubleshooting workflow
4. Add migration guide (from old skills to unified)

## Success Metrics

**Deterministic output:**
- Same questions → same architecture structure
- Zero anti-patterns in generated code
- All tests pass immediately

**Testability:**
- No global mocking required
- preset() pattern used consistently
- Test setup <10 lines per test

**Traceability:**
- All flows journaled
- Extensions can observe all operations
- Logs LLM-parseable (<500 tokens per trace)

**Maintainability:**
- Architecture map stays current (update triggers clear)
- Files <500 lines (enforced via validation)
- Flat structure (easy navigation)

**Continuous development:**
- Dependency graph enables impact analysis
- Smart log extraction (no full codebase reads)
- Regression risk assessment (high/medium/low)

## Migration Path

**From pumped-fn-typescript + pumped-fn-react:**

1. Keep old skills temporarily (backward compatibility)
2. Add unified skill as pumped-fn
3. Test in parallel (both old and new)
4. Once validated, mark old skills deprecated
5. Eventually remove old skills (version 5.0)

**For existing projects:**
- No code changes required
- Generate architecture map: `pnpm pumped-map --generate`
- Add observability extension (optional)
- Continue development with unified skill

## Open Questions

None. Design complete and validated.

## Next Steps

1. ✅ Design documented
2. ⏳ Worktree setup
3. ⏳ Implementation plan creation
4. ⏳ Skill file writing
5. ⏳ Validation testing
6. ⏳ Integration and documentation
