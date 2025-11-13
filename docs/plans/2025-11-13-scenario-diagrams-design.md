# Scenario-Based Diagrams for Library Understanding

**Date:** 2025-11-13
**Status:** Design Approved

## Purpose

Create scenario-based sequence and state diagrams that explain how pumped-fn works, serving three audiences:
1. **Library users** - understand core concepts and troubleshoot applications
2. **AI models** - understand library internals for better code assistance
3. **Library contributors** - understand internal mechanics and design decisions

## Core Scenarios

### Priority 1: Flow Execution Lifecycle
Complete story from flow creation through execution, context building, and cleanup.

**Key aspects:**
- Flow creation and executor assignment
- ExecutionContext hierarchy and data flow
- Child flow spawning and nesting
- Return value capture
- Cleanup registration (LIFO order)
- ExecutionTree node creation
- Cleanup execution on invalidation/disposal

### Priority 2: Error Handling Paths
What happens when things go wrong at different stages.

**Key aspects:**
- Error thrown during flow execution
- Error propagation through execution stack
- Cleanup still executes despite errors
- CleanupError handling via extensions
- ExecutionTree failure marking
- Parallel execution error modes (fail-fast vs collect)

## Troubleshooting Focus

Diagrams must help users answer:
1. **"What's the execution order?"** - Understanding parallel flow timing, child flow ordering, async behavior
2. **"Where did this error come from?"** - Tracing errors back through ExecutionTree to root cause

## Architecture: Scenario Narratives

Each diagram tells a complete story with annotations, combining sequence and state views where useful.

### File Organization

```
docs/
  diagrams/
    scenarios/
      01-flow-lifecycle-happy-path.md
      02-error-propagation.md
      03-parallel-execution-order.md
      04-error-tracing-root-cause.md
  guides/
    troubleshooting.md

.claude/skills/pumped-design/references/
  diagrams/
    internal-flow-execution.md
    internal-cleanup-order.md
    internal-reactive-tracking.md

scripts/
  validate-diagrams.sh
```

### User-Facing Diagrams (docs/diagrams/scenarios/)

**01-flow-lifecycle-happy-path.md**
- Sequence diagram: user code → executor → context → execution → cleanup
- State chart: Pending → Executing → Completed → Cleaning → Disposed
- Annotations: context data flow, cleanup order (LIFO), child execution timing
- Links to relevant code locations

**02-error-propagation.md**
- Sequence diagram: error thrown → bubbling → cleanup execution → error handling
- Decision points: parallel execution error modes
- Annotations: cleanup guarantees, CleanupError handling, ExecutionTree failure state

**03-parallel-execution-order.md**
- Timeline diagram: concurrent flow submission → async execution → completion order
- Annotations: timing relationships, ExecutionTree tracking
- Common pitfalls: assuming sequential execution

**04-error-tracing-root-cause.md**
- Flowchart: observed error → ExecutionTree query → parent chain traversal → root cause
- Common patterns: invalid input, reactive invalidation, resource exhaustion
- Diagnostic steps

### AI/Contributor Diagrams (.claude/skills/pumped-design/references/diagrams/)

More detailed implementation-level diagrams:
- Internal state transitions and invariants
- Detailed reactive tracking mechanisms
- Internal cleanup sequencing rules

### Troubleshooting Guide (docs/guides/troubleshooting.md)

Symptom-based index linking to diagram sections:
- "My flow executed twice" → reactive invalidation diagram
- "Cleanup didn't run" → lifecycle diagram + cleanup order
- "Unexpected execution order" → parallel execution diagram
- "Can't find error source" → error tracing flowchart

## Diagram Template Structure

Each scenario diagram markdown file contains:

```markdown
# Scenario: [Name]

## Purpose
[What this diagram explains]

## Prerequisites
[What user should understand first]

## Diagram

```mermaid
[diagram code]
```

## Key Points

- [Annotation 1]
- [Annotation 2]
- [Annotation 3]

## Code References

- `packages/next/src/[file]:[line]` - [what happens here]

## Related Scenarios

- [Link to related diagram]

## Common Issues

- [Pitfall related to this scenario]
```

## Mermaid CLI Validation

### Installation
```bash
pnpm add -g @mermaid-js/mermaid-cli
```

### Validation Workflow
1. Write mermaid code in markdown file
2. Extract mermaid block to temp file
3. Run `mmdc -i temp.mmd -o output.svg`
4. If validation passes → diagram syntax correct
5. If validation fails → fix errors and retry
6. Only commit validated diagrams

### Validation Script (scripts/validate-diagrams.sh)
- Extracts all mermaid blocks from markdown files
- Validates each with mermaid CLI
- Reports errors with file:line references
- Can run in CI or pre-commit hook

### Diagram Types Used
- `sequenceDiagram` - flow execution timelines
- `stateDiagram-v2` - lifecycle states
- `flowchart TD` - error tracing decision trees
- Timeline annotations - parallel execution timing

## Success Criteria

1. **Syntax correctness** - all diagrams pass mermaid CLI validation
2. **Render quality** - diagrams display correctly in GitHub
3. **Troubleshooting effectiveness** - users can trace symptoms to solutions
4. **AI comprehension** - Claude can reference diagrams for code assistance
5. **Maintainability** - diagrams stay in sync with code changes

## Implementation Notes

- Use relative paths in plans (not absolute paths with usernames)
- Link to code with `packages/next/src/` prefix
- Keep diagrams focused on single scenario
- Use cross-references for complex interactions
- Validate before committing
