# Unified Pumped-fn Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create comprehensive unified pumped-fn skill replacing fragmented typescript/react skills with deterministic architecture generation, zero-violation enforcement, and LLM-optimized troubleshooting.

**Architecture:** Single skill file (~2000 lines) with 8 sections: Activation, Questions, Decision Trees, Templates, Environment-Specific, Anti-Patterns, Observability, Validation. Includes compact YAML architecture map for navigation and coding style rules enforcement.

**Tech Stack:** Markdown, YAML, skill frontmatter, decision tree ASCII diagrams

---

## Task 1: Create Skill File Structure

**Files:**
- Create: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Create directory and file**

```bash
mkdir -p .claude/skills/pumped-fn
touch .claude/skills/pumped-fn/SKILL.md
```

**Step 2: Write frontmatter**

Add to `.claude/skills/pumped-fn/SKILL.md`:

```yaml
---
name: pumped-fn
description: Comprehensive guidance for building observable, testable TypeScript applications with @pumped-fn - auto-activates for TypeScript projects, guides architecture, API selection, testing, and troubleshooting
when_to_use: when working on TypeScript projects (auto-activates), architecting applications, designing state management, selecting pumped-fn APIs, implementing testable code, or troubleshooting pumped-fn applications
version: 4.0.0
auto_activate: true
---
```

**Step 3: Verify frontmatter syntax**

Check YAML valid, fields present (name, description, when_to_use, version, auto_activate).

**Step 4: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): create unified pumped-fn skill structure

Initialize skill file with frontmatter.
First step toward unified architecture guidance.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Section 1 - Activation & Installation

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write activation check section**

Add to SKILL.md after frontmatter:

```markdown
# Pumped-fn Unified Skill

## ACTIVATION CHECK (READ THIS FIRST)

<EXTREMELY_IMPORTANT>
**This skill auto-activates for ALL TypeScript projects.**

### Activation Flow

1. **Detect TypeScript project**
   - Check for tsconfig.json OR .ts files in codebase
   - If found → Continue to step 2

2. **Check for @pumped-fn/core-next**
   - Search package.json dependencies
   - If FOUND → Activate full skill guidance
   - If NOT FOUND → Show installation recommendation

3. **Installation Recommendation (when missing)**
   ```
   I notice this is a TypeScript project without @pumped-fn/core-next.

   Pumped-fn provides:
   - Observable operations (automatic logging/tracing/metrics)
   - Testable architecture (dependency injection via executors)
   - Type-safe resource management (scope lifecycle, cleanup)
   - Framework-agnostic business logic

   Install with:
   pnpm add @pumped-fn/core-next
   # or
   npm install @pumped-fn/core-next

   Would you like to use pumped-fn patterns for this project?
   ```

   If YES → Proceed with architecture guidance
   If NO → Skill remains passive (available for reference)

**Red flags you forgot this skill:**

**Architecture red flags:**
- Architecting TypeScript app without mentioning executors/scope
- Designing state management with plain classes/singletons
- Planning API integration without resource layer
- Building observable systems with manual instrumentation

**Testing red flags:**
- Code requires extensive mocking to test (mocking fetch, process.env, global state)
- Tests coupled to implementation details (mocking internal functions)
- No clear way to inject test dependencies
- "We'll add tests later" (architecture not designed for testability)

**Implementation red flags:**
- Implementation very brittle, changes break tests easily
- Too blackbox, can't verify intermediate steps
- Unclear what's being tested (testing implementation, not behavior)
- Test setup more complex than code under test

**Why these matter:**
Pumped-fn architecture makes code testable BY DESIGN:
- preset() for dependency injection (no global mocking)
- Journaled operations (verify steps, not implementation)
- Resource layer separation (mock at boundaries, not internals)
- Extensions for observability (trace without changing code)

**If you see these red flags → STOP. Apply pumped-fn patterns to fix root cause.**
</EXTREMELY_IMPORTANT>
```

**Step 2: Verify section completeness**

Check includes: activation flow, installation recommendation, all red flag categories.

**Step 3: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add activation and red flags section

Auto-activation for TypeScript projects.
Installation recommendation flow.
Comprehensive red flags for testability/brittleness.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Section 2 - Critical Questions Framework

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write greenfield questions**

Add to SKILL.md:

```markdown
## Critical Questions Framework

**Purpose:** Gather requirements to generate deterministic, zero-violation architecture.

**Process:** Ask questions ONE AT A TIME, use AskUserQuestion for choices.

### Greenfield Mode (New Projects)

#### Question 1: Application Type

**Ask:**
"What type of application are you building?"

**Options (via AskUserQuestion):**
- **HTTP Server** - REST API, GraphQL, RPC endpoints (Express, Fastify, Hono)
- **CLI Application** - Command-line tools, scripts, one-shot operations
- **Scheduled Jobs** - Cron, background workers, periodic tasks
- **Event Processor** - Queue consumers, Kafka, WebSocket servers, SSE
- **SPA Frontend** - React, client-side state management
- **Meta-framework** - Next.js, TanStack Start, full-stack with SSR
- **Hybrid/Multiple** - Combination (e.g., API + background jobs + admin CLI)

**Impact:** Determines scope lifecycle pattern, interaction point structure.

---

#### Question 2: External Systems Inventory

**Ask:**
"What external systems will your application integrate with?"

**Options (multiSelect: true):**
- **Database** - PostgreSQL, MySQL, MongoDB, SQLite
- **Cache/KV Store** - Redis, Memcached
- **HTTP APIs** - Third-party REST/GraphQL services
- **Message Queue** - RabbitMQ, SQS, Kafka
- **WebSocket/SSE** - Real-time bidirectional or server-sent events
- **File Storage** - S3, local filesystem, CDN
- **Auth Providers** - OAuth, SAML, JWT validation
- **Email/SMS** - SendGrid, Twilio, notification services
- **None** - Self-contained application

**Impact:** Determines resource layer structure, cleanup requirements.

---

#### Question 3: Business Operations Mapping

**Ask:**
"What are your main business operations?" (open-ended, then categorize)

**Listen for patterns:**
- **CRUD operations** - Simple create/read/update/delete
- **Workflows** - Multi-step processes (order checkout, user registration)
- **Validations** - Input validation, business rule checks
- **Transformations** - Data processing, aggregation, formatting
- **Orchestration** - Coordinating multiple external calls
- **Real-time updates** - Live data synchronization, subscriptions

**Impact:** Determines flow structure, journal granularity, depth limits.

---

#### Question 4: Testing Strategy

**Ask:**
"How do you want to test this application?"

**Options (via AskUserQuestion):**
- **Unit tests with mocks** - Fast, isolated, mock all external dependencies via preset()
- **Integration tests with real resources** - Slower, realistic, use test database/services
- **Hybrid approach** - Unit for business logic, integration for critical paths
- **E2E only** - Test through full application (not recommended, but supported)

**Impact:** Determines preset() patterns, test fixture generation, resource abstractions.

---

#### Question 5: Observability Requirements

**Ask:**
"What observability do you need?"

**Options (via AskUserQuestion):**
- **Basic logging** - Console logs for development, file logs for production
- **Structured logging** - JSON logs with context, correlation IDs
- **Distributed tracing** - OpenTelemetry, Jaeger integration
- **Metrics collection** - Prometheus, custom metrics
- **Full audit trail** - Every operation journaled to storage for replay/debugging
- **LLM-optimized troubleshooting** - Smart log file output for AI analysis

**Impact:** Determines extension setup, journal persistence, log format.

---

#### Question 6: Environment-Specific Details

**Backend (if HTTP Server, CLI, Scheduled, Events):**
- "Which framework?" (Express, Fastify, Hono, Commander, etc.)
- "Deployment target?" (Node.js, Deno, Bun, serverless)

**Frontend (if SPA, Meta-framework):**
- "Which framework?" (React, Vue, Svelte)
- "State management needs?" (Simple derived state, complex cross-component state)
- "Protocol?" (REST, GraphQL, WebSocket, RPC)

---

### Questionnaire Complete Signal

After gathering answers, announce:

"I have enough context to generate your architecture. Here's what I understand:
- Application type: [X]
- External systems: [Y, Z]
- Business operations: [A, B, C]
- Testing strategy: [D]
- Observability: [E]

Proceeding to generate deterministic, zero-violation architecture..."
```

**Step 2: Write continuous development mode**

Add to SKILL.md:

```markdown
### Continuous Development Mode (Existing Codebases)

**Detection:**
```
1. Check if @pumped-fn/core-next already in package.json
2. Check if executors (provide/derive/flow) exist in codebase
3. If YES → Enter Continuous Development Mode
```

#### Change Type Detection

**Ask:**
"What are you trying to do?"

**Listen for patterns (categorize automatically):**
- **Add new feature** - "Add user authentication", "Support webhooks"
- **Modify existing** - "Change validation logic", "Update API response format"
- **Fix bug** - "Login fails", "Race condition in checkout"
- **Refactor** - "Extract shared logic", "Improve performance"
- **Troubleshoot** - "Why is X happening?", "Logs show Y error"

**Action based on type:**
- Add new → Generate dependency graph → Ask impact questions
- Modify existing → Find affected executors → Check cascade impact
- Fix bug → Use systematic-debugging skill + dependency graph
- Refactor → Analyze dependencies → Ensure testability preserved
- Troubleshoot → Use graph to trace operations → Smart log analysis

---

#### Architecture Map (.pumped-fn/map.yaml)

**Ultra-compact navigation index:**

```yaml
# Keywords for navigation, agent expands via glob/grep

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

**Purpose:** Keywords for agent navigation (~50 tokens, not 2000)

**Maintenance triggers (update map when):**
- ✅ New major component (new repository, new flow category)
- ✅ New integration (new external API, new resource)
- ✅ New interaction point (new route file, new cron job)
- ❌ Individual flow added to existing category
- ❌ Utility function added to existing file
- ❌ Minor refactoring within layer

---

#### Dependency Graph Analysis

**Before making ANY change, analyze dependencies:**

Present to user:
"I've analyzed your dependency graph. Here's the impact map for your change..."

**Example:**
```
You want to modify: userRepository

Impact Analysis:
├─ Direct consumers: createUser, loginUser, createPost
├─ Indirect consumers: POST /users, POST /login, POST /posts
├─ Test files: userRepository.test.ts, createUser.test.ts, loginUser.test.ts

Questions:
1. Are you changing the interface (return type, parameters)?
   → YES: Must update all 3 consumers + tests
   → NO: Only update implementation + userRepository tests

2. Will this break existing tests?
   → Run preset() analysis: which tests use userRepository?
   → Affected test files: [list]
```

---

#### Impact Analysis & Regression Prevention

**Risk assessment:**

```
HIGH RISK (requires full test suite):
- Modifying root resources (dbPool, apiClient)
  → Affects ALL downstream executors
  → Run: pnpm test (full suite)

MEDIUM RISK (requires integration tests):
- Modifying repositories (userRepository)
  → Affects multiple flows
  → Run: pnpm test userRepository createUser loginUser

LOW RISK (requires unit tests):
- Modifying leaf flows (createPost)
  → No downstream dependencies
  → Run: pnpm test createPost
```

**Present checklist:**
```
Before making this change:
☐ Dependency graph analyzed
☐ Impact scope identified: [HIGH/MEDIUM/LOW]
☐ Affected tests listed: [files]
☐ Regression test strategy: [command to run]
☐ Observability check: journals preserved
☐ Type safety check: no any/unknown introduced
```

---

#### Graph-Guided Troubleshooting

**For troubleshooting requests:**

```
Issue: "Login returns 500 error"

Graph-Guided Investigation:
1. Find entry point: POST /login → loginUser flow
2. Trace dependencies:
   loginUser → userRepository, sessionStore
   userRepository → dbPool
   sessionStore → redisCache

3. Generate smart log query:
   "Show me logs for:
   - loginUser execution
   - userRepository.findByEmail operation
   - sessionStore.create operation
   - Any dbPool/redisCache errors"

4. Ask targeted questions:
   - Does loginUser have ctx.run() keys for all steps?
   - Is error caught in flow discriminated union?
   - Are resources properly initialized?
```
```

**Step 3: Verify completeness**

Check both modes present (greenfield + continuous), all questions included, map format documented.

**Step 4: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add critical questions framework

Greenfield: 6 questions for architecture generation.
Continuous: dependency graph, impact analysis, troubleshooting.
Architecture map format for LLM navigation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Section 3 - Core API Decision Trees

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write first 5 decision trees**

Add decision trees 1-5 from design document to SKILL.md:
- Component type
- provide() vs derive()
- flow() vs function
- When .reactive
- Scope lifecycle

**Step 2: Write remaining 4 decision trees**

Add decision trees 6-9:
- Tags vs direct values
- ctx.run() vs ctx.exec()
- Testing strategy
- Promised utilities

**Step 3: Add quick reference table**

Add table mapping needs to APIs at end of section.

**Step 4: Verify completeness**

Check all 9 trees present, examples included, table added.

**Step 5: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add core API decision trees

9 decision trees for fast API selection.
Quick reference table for common needs.
Examples for each pattern.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Section 4 - Architecture Generation Templates

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write templates 1-4**

Add to SKILL.md:
- Template 1: Resource layer
- Template 2: Repository layer
- Template 3: Flow layer
- Template 4: Interaction points (HTTP)

**Step 2: Write templates 5-7**

Add to SKILL.md:
- Template 5: Main entry point
- Template 6: Test fixtures
- Template 7: Extensions (observability)

**Step 3: Verify template completeness**

Check each template has: pattern definition, examples, coding style enforcement hooks.

**Step 4: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add architecture generation templates

7 templates for deterministic code generation.
Resource, repository, flow, interaction, main, tests, extensions.
All enforce type safety, journaling, testability.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Section 5 - Environment-Specific Guidance

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write backend subsections**

Add to SKILL.md:
- HTTP servers (Express, Fastify, Hono)
- CLI applications (Commander)
- Scheduled jobs (cron)
- Event processors (Kafka, queues)

**Step 2: Write frontend subsections**

Add to SKILL.md:
- React SPA
- Meta-frameworks (Next.js, TanStack Start)

**Step 3: Write serverless subsection**

Add Lambda/edge functions pattern.

**Step 4: Verify completeness**

Check all environments covered, scope lifecycle pattern specified for each.

**Step 5: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add environment-specific guidance

Backend: HTTP, CLI, cron, events.
Frontend: React SPA, meta-frameworks.
Serverless: Lambda/edge.
Scope lifecycle per environment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Section 6 - Anti-Pattern Detection

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write anti-patterns 1-3**

Add to SKILL.md:
- Anti-pattern 1: Multiple scopes
- Anti-pattern 2: Built-ins in resources
- Anti-pattern 3: Premature escape

**Step 2: Write anti-patterns 4-6**

Add to SKILL.md:
- Anti-pattern 4: Missing journaling
- Anti-pattern 5: Type safety violations
- Anti-pattern 6: Excessive mocking

**Step 3: Add validation checks**

For each anti-pattern, add automated detection pattern (grep, etc).

**Step 4: Verify completeness**

Check all 6 anti-patterns have: detection, correction, validation check.

**Step 5: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add anti-pattern detection and corrections

6 critical anti-patterns with automated detection.
Multiple scopes, built-ins, premature escape, missing journaling, type violations, excessive mocking.
Validation checks and corrections for each.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Section 7 - Observability & Troubleshooting

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write extension architecture**

Add to SKILL.md:
- Extension hooks (execute, journal, resolve)
- wrap() pattern implementation

**Step 2: Write LLM-optimized log format**

Add to SKILL.md:
- JSONL format specification
- Compact field naming (t, op, dur, cid)
- Benefits and token savings

**Step 3: Write smart log extraction workflow**

Add to SKILL.md:
- Troubleshooting workflow
- Correlation ID extraction
- Trace analysis pattern

**Step 4: Add file-based logging strategy**

Add to SKILL.md:
- Log file structure (flows.jsonl, errors.jsonl, performance.jsonl)
- Extension implementation example

**Step 5: Verify completeness**

Check includes: extension architecture, log format, extraction workflow, file strategy.

**Step 6: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add observability and troubleshooting

Extension architecture with hooks.
LLM-optimized JSONL log format (<500 tokens per trace).
Smart log extraction workflow.
File-based logging strategy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Section 8 - Validation Checklist & Coding Style

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Write pre-generation checklist**

Add to SKILL.md:
- Architecture map check
- Tag configuration
- Scope strategy
- Output format (discriminated unions)
- Journaling plan
- Test strategy
- Observability extension

**Step 2: Write post-generation checklist**

Add to SKILL.md:
- Type safety verification
- Anti-pattern checks
- Single scope verification
- Journaling verification
- Test pattern verification
- File structure verification
- Architecture map update

**Step 3: Write runtime validation**

Add commands: tsc --noEmit, tests, build, map verification.

**Step 4: Write coding style rules**

Add to SKILL.md:
- File organization (flat with suffixes)
- File size limit (500 lines)
- Naming style (function-programming, camelCase)
- Communication style (concise, sacrifice grammar)

**Step 5: Add code examples**

Add complete examples demonstrating all style rules.

**Step 6: Verify completeness**

Check both checklists present, runtime validation commands, coding style rules, examples.

**Step 7: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "feat(skill): add validation checklist and coding style

Pre/post-generation checklists.
Runtime validation commands.
Coding style rules: flat structure, <500 lines, function-style naming, concise communication.
Complete code examples.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Update Skills README

**Files:**
- Modify: `.claude/skills/README.md`

**Step 1: Add pumped-fn to skill list**

Update Pumped-fn Specific Skills section:

```markdown
## Pumped-fn Specific Skills

- **pumped-fn** - Unified comprehensive guidance for @pumped-fn (auto-activates for TypeScript projects, architecture generation, testing, troubleshooting)
- ~~**pumped-fn-typescript**~~ - DEPRECATED: Superseded by unified pumped-fn skill (v4.0.0+)
- ~~**pumped-fn-react**~~ - DEPRECATED: Superseded by unified pumped-fn skill (v4.0.0+)
```

**Step 2: Verify README structure**

Check markdown valid, deprecation notices clear.

**Step 3: Commit**

```bash
git add .claude/skills/README.md
git commit -m "docs(skills): add unified pumped-fn skill, deprecate old skills

Add pumped-fn to active skills list.
Mark pumped-fn-typescript and pumped-fn-react as deprecated.
Version 4.0.0 supersedes fragmented skills.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Update CLAUDE.md Reference

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update API changes checklist**

Locate "Checklist for API changes" section, update skill reference:

```markdown
5. **ALWAYS check and update .claude/skills/pumped-fn/SKILL.md** - this is critical for skill accuracy
```

**Step 2: Verify CLAUDE.md consistency**

Check other references to skills still accurate.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reference unified pumped-fn skill

Update API change checklist to reference .claude/skills/pumped-fn/SKILL.md.
Critical for maintaining skill accuracy with library changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: Verification Testing

**Files:**
- None (testing only)

**Step 1: Test greenfield detection**

Create test TypeScript file in `/tmp`, verify skill activation logic.

**Step 2: Test decision tree navigation**

Walk through each decision tree, verify paths lead to correct APIs.

**Step 3: Test template completeness**

Verify each template has all required fields for code generation.

**Step 4: Test anti-pattern detection**

Introduce violations, verify grep patterns catch them.

**Step 5: Document verification results**

Add verification notes to design doc or create test-results.md.

**Step 6: Commit design doc update**

```bash
git add docs/plans/2025-10-27-unified-pumped-fn-skill-design.md
git commit -m "docs(plan): add verification test results

Tested greenfield detection, decision trees, templates, anti-patterns.
All validation checks working as designed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: Final Integration

**Files:**
- Modify: `claude-skill/plugin.json` (if publishing to marketplace)

**Step 1: Update plugin.json if needed**

If publishing to marketplace, add pumped-fn skill entry, mark old skills deprecated.

**Step 2: Test skill loading**

Verify skill loads correctly in Claude Code, frontmatter parsed.

**Step 3: Create migration guide**

Document for users transitioning from old skills (optional, separate doc).

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(skill): unified pumped-fn skill complete

Complete rewrite: pumped-fn-typescript + pumped-fn-react → unified pumped-fn.
Auto-activation, architecture generation, zero-violation enforcement.
LLM-optimized troubleshooting, dependency graph navigation.
Version 4.0.0.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Completion Checklist

After all tasks:

```
☐ Skill file created with all 8 sections
☐ Frontmatter valid and complete
☐ All decision trees present (9 total)
☐ All templates present (7 total)
☐ All anti-patterns documented (6 total)
☐ Coding style rules integrated
☐ README updated with deprecation notices
☐ CLAUDE.md references updated
☐ Verification testing complete
☐ All commits follow atomic commit pattern
☐ Skill ready for use in production
```

---

## Notes

**File size:** Estimated ~1800-2200 lines for complete skill.

**Maintenance:** Update skill when API changes (per CLAUDE.md checklist).

**Testing:** Use systematic-debugging skill if issues arise during verification.

**Migration:** Old skills remain available temporarily for backward compatibility.
