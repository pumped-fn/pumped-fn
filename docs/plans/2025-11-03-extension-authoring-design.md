# Extension Authoring Sub-skill Design

**Date:** 2025-11-03
**Type:** Skill Enhancement
**Target:** `.claude/skills/pumped-design/references/extension-authoring.md`

## Purpose

Create advanced sub-skill for authoring production-ready pumped-fn extensions, complementing existing extension-basics.md which covers usage of simple observability extensions.

## Scope

### Extension Types Covered
1. **Stateful extensions** - Caching, rate limiting, connection pooling
2. **Integration extensions** - APM, logging services, external monitoring
3. **Context propagation** - Tracing IDs, request context, tenant isolation
4. **Policy enforcement** - Authorization, validation, auditing
5. **Devtools** - Flow inspector, execution timeline
6. **Server integration** - Exposing flows as API endpoints

### Key Capabilities to Teach
- **Scope architecture** - How extensions access pumped-fn internals
- **Scope methods** - resolve, run, exec for extension operations
- **Tag system** - Context propagation through execution hierarchy
- **Lifecycle management** - init → wrap → dispose patterns
- **Error handling** - Graceful degradation, not breaking flows
- **Type safety** - Working with Operation discriminated unions

### Emphasis Areas
1. **Error handling and resilience** - Extensions must never break flows
2. **Type safety patterns** - Maintain full type inference, avoid any/unknown

## Structure

### Progressive Journey Format

**Part 1: Extension Architecture & Scope Model**
- Mental model: How extensions integrate with runtime
- Scope capabilities: What extensions can access and why
- Extension lifecycle: init → wrap → dispose
- Context vs Scope: When to use what
- Tag system: Propagating data through execution hierarchy

**Part 2: Building Your First Stateful Extension**
- Complete guided example: Request correlation ID tracker
- Pattern walkthrough: init (setup), wrap (propagate), dispose (cleanup)
- Error handling: try/catch patterns, graceful degradation
- Type safety: Working with Operation discriminated union
- Testing: Unit and integration test approaches

**Part 3: Advanced Patterns by Capability**
- Stateful patterns: Rate limiter, connection pool, cache
- Integration patterns: APM (DataDog/NewRelic), external logging
- Context propagation: Multi-tenant isolation, distributed tracing
- Policy enforcement: Authorization checks, input validation
- Devtools: Flow inspector, execution timeline
- Server integration: Exposing flows as HTTP/RPC endpoints

## Routing Integration

### Routing Table Entry
```
| Extension: Authoring | extension, author, create, stateful, integration, devtools | Authoring reusable extensions | references/extension-authoring.md |
```

### Tags
extension, author, create, stateful, integration, devtools, context, policy, server, scope, lifecycle, testing

### Load When
- "create extension"
- "build stateful extension"
- "integrate with external service"
- "add devtools"
- "expose flows as API"
- "use scope in extension"
- "extension lifecycle"

## Relationship to Existing Sub-skills

**Extension: Basics** (extension-basics.md)
- **Scope:** Using existing extensions
- **Coverage:** wrap() hooks, observability patterns (logging, metrics, tracing)
- **Level:** Beginner

**Extension: Authoring** (extension-authoring.md)
- **Scope:** Creating new reusable extensions
- **Coverage:** Stateful patterns, scope usage, advanced capabilities
- **Level:** Advanced

## Token Optimization Strategies

1. **Code examples** - One complete example per pattern, no redundant variations
2. **Frontmatter tags** - Comprehensive for AI routing, reduces need for full reads
3. **Progressive disclosure** - Part 1 (foundation) → Part 2 (guided) → Part 3 (reference)
4. **Cross-references** - Link to extension-basics.md instead of repeating basics
5. **Type annotations** - Show once with explanation, assume knowledge in later examples
6. **Error patterns** - Template approach, not exhaustive edge cases

## Success Criteria

Developer can:
1. Understand scope architecture and capabilities
2. Build stateful extension with proper lifecycle
3. Implement error handling that never breaks flows
4. Maintain type safety with Operation discriminated unions
5. Test extensions in isolation and integration
6. Choose appropriate pattern for their use case (stateful, integration, policy, etc.)

## Implementation Notes

- File location: `.claude/skills/pumped-design/references/extension-authoring.md`
- Update routing table in: `.claude/skills/pumped-design/SKILL.md`
- Reference real examples from: `packages/next/tests/extensions.test.ts`
- Keep examples generic (not case-specific)
