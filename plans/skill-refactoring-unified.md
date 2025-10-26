# Pumped-fn Skill Refactoring: Unified Architecture Guide

## Problem Statement

Current skills (pumped-fn-typescript, pumped-fn-react) are isolated with significant duplication:
- Core concepts repeated across both (Resources, Scope, Tags, Type Safety)
- Anti-patterns duplicated
- Testing strategies duplicated
- No shared foundation for future skills (Vue, Svelte, backend-specific)
- 1410 + 1192 = 2602 lines with ~40% duplication

## Goal

Create a unified, modular skill system that:
1. **Eliminates duplication** - Core concepts in shared modules
2. **Supports both web and backend** - Comprehensive TypeScript guidance
3. **Guides architecture** - Full-stack, backend-only, frontend-only
4. **Scales to new frameworks** - Easy to add Vue, Svelte, etc.
5. **Maintains independence** - Each skill can work standalone

## Proposed Structure

```
claude-skill/
  skills/
    pumped-fn/                              # Unified skill entry point
      SKILL.md                              # Main skill (auto-activates, routing)

      core/
        CONCEPTS.md                         # Resources, Executors, Scope, Tags, Extensions
        TYPE-SAFETY.md                      # Core.InferOutput, type patterns
        ANTI-PATTERNS.md                    # Scope duplication, built-ins, premature escape
        TESTING.md                          # preset(), mocking strategies
        PROMISED-API.md                     # Promised<T> utilities

      application-types/
        HTTP-SERVER.md                      # Express, Fastify, Hono (singleton scope)
        CLI.md                              # Commander, CLI patterns (per-command scope)
        CRON.md                             # Scheduled jobs (singleton scope)
        QUEUE-PROCESSOR.md                  # Kafka, RabbitMQ, SQS (singleton scope)
        SERVERLESS.md                       # Lambda, edge functions (per-invocation scope)
        REACT-APP.md                        # React SPA patterns
        META-FRAMEWORK.md                   # Next.js, TanStack Start, Remix

      advanced/
        DATABASE.md                         # Transactions, connection pooling
        AUTH.md                             # Auth flows (backend + frontend)
        REALTIME.md                         # WebSocket, SSE patterns
        FULLSTACK.md                        # Coordinating backend + frontend
        PROGRESSIVE-ENHANCEMENT.md          # localStorage → API migration

      patterns/
        API-DESIGN.md                       # RPC, REST, GraphQL with flows
        ERROR-HANDLING.md                   # Result types, discriminated unions
        OBSERVABILITY.md                    # Extensions for logging, tracing
        COMPOSITION.md                      # Flow composition, depth limits

      README.md                             # Installation, overview
      QUICK-START.md                        # 5-minute getting started

    pumped-fn-typescript/                   # Legacy, redirects to pumped-fn
    pumped-fn-react/                        # Legacy, redirects to pumped-fn
```

## Main SKILL.md Structure

```markdown
---
name: Pumped-fn Unified
description: Comprehensive TypeScript application architecture with @pumped-fn/core-next - backend, frontend, full-stack
when_to_use: when working with @pumped-fn/core-next, designing TypeScript applications, or discussing architecture for servers, CLIs, React apps, or full-stack systems
version: 2.0.0
---

# Pumped-fn Unified Skill

## ACTIVATION CHECK

**Auto-activates when:**
1. package.json contains `@pumped-fn/core-next` OR `@pumped-fn/react`
2. Brainstorming TypeScript architecture
3. Designing backend systems (servers, CLIs, cron, queues)
4. Designing frontend systems (React, state management)
5. Discussing full-stack architecture

**Red flags you forgot this skill:**
- Designing without Resources, Flows, Scope
- Using global state/config instead of tags
- Direct dependency injection without executors
- No mention of testability via preset()

## Core Concepts (ALL Applications)

> [!IMPORTANT]
> Read core concepts first. All patterns build on these.

### Quick Links
- [Core Concepts](core/CONCEPTS.md) - Resources, Executors, Scope, Tags
- [Type Safety](core/TYPE-SAFETY.md) - Core.InferOutput, inference patterns
- [Critical Anti-Patterns](core/ANTI-PATTERNS.md) - Common mistakes (READ THIS)
- [Testing](core/TESTING.md) - preset(), mocking strategies

### The Four Elements
1. **Resources** - External integrations (DB, API, services)
2. **Flows** - Business logic (observable, journaled, testable)
3. **Scope** - Dependency container (singleton per app)
4. **Tags** - Configuration boundaries (injected via scope)

## Application Type Guides

### Backend Development

Choose your application type:
- [HTTP Server](application-types/HTTP-SERVER.md) - Express, Fastify, Hono
- [CLI Application](application-types/CLI.md) - Commander, CLI patterns
- [Cron Jobs](application-types/CRON.md) - Scheduled tasks
- [Queue Processor](application-types/QUEUE-PROCESSOR.md) - Kafka, RabbitMQ
- [Serverless](application-types/SERVERLESS.md) - Lambda, Cloudflare Workers

### Frontend Development

Choose your framework:
- [React SPA](application-types/REACT-APP.md) - React patterns, hooks
- [Meta-Framework](application-types/META-FRAMEWORK.md) - Next.js, TanStack Start

### Full-Stack Development

Coordinating backend + frontend:
- [Full-Stack Architecture](advanced/FULLSTACK.md)
- [Progressive Enhancement](advanced/PROGRESSIVE-ENHANCEMENT.md) - localStorage → API

## Advanced Topics

- [Database Patterns](advanced/DATABASE.md) - Transactions, pooling
- [Auth Patterns](advanced/AUTH.md) - Backend + frontend coordination
- [Real-time](advanced/REALTIME.md) - WebSocket, SSE
- [API Design](patterns/API-DESIGN.md) - RPC, REST, GraphQL with flows
- [Observability](patterns/OBSERVABILITY.md) - Extensions, logging, tracing

## Pattern Enforcement (Three-Tier)

### Tier 1: Critical (Block/require fixes)
- Type safety: No any/unknown/casting
- Scope lifecycle: One app, one scope (exceptions documented)
- Flow composition: Always use journal keys
- Tag system: Type-safe tags only

### Tier 2: Important (Strong warnings)
- Built-ins in resources (breaks portability)
- Premature escape (breaks testability)
- Missing reactivity
- Incorrect dependency modifiers

### Tier 3: Best Practices (Educational)
- Code organization
- Observability patterns
- Error handling
- Testing strategies

## Quick Decision Tree

```
What am I building?
├─ HTTP Server? → application-types/HTTP-SERVER.md
├─ CLI tool? → application-types/CLI.md
├─ Cron job? → application-types/CRON.md
├─ Event processor? → application-types/QUEUE-PROCESSOR.md
├─ Serverless? → application-types/SERVERLESS.md
├─ React app? → application-types/REACT-APP.md
├─ Next.js/meta? → application-types/META-FRAMEWORK.md
└─ Full-stack? → advanced/FULLSTACK.md
```

## Context Detection

**Backend indicators:**
- Express, Fastify, Hono, Koa imports
- Commander, yargs imports
- node-cron, bull, kafka imports
- DB libraries (pg, mysql2, prisma)

**Frontend indicators:**
- React, @pumped-fn/react imports
- JSX syntax
- Component patterns
- Hook usage

**Guidance priority:**
1. If both detected → Guide to FULLSTACK.md
2. If backend only → Guide to appropriate backend type
3. If frontend only → Guide to appropriate frontend type

## Remember

- Resources = integration layer (no business logic)
- Flows = business logic (observable, testable)
- One app, one scope (exceptions: Lambda, multi-tenant)
- Always use journal keys: ctx.exec('key', flow, input)
- Type safety: Core.InferOutput<T> for executor types
- Testing: Mock at resource layer with preset()
```

## Core Modules Content

### core/CONCEPTS.md
- Resources (provide/derive)
- Flows (flow with deps)
- Scope lifecycle
- Tags (configuration)
- Extensions (cross-cutting)
- Quick API reference

### core/TYPE-SAFETY.md
- Core.InferOutput<T> pattern
- Type inference rules
- Acceptable type assertions
- Type guard patterns
- Avoiding any/unknown

### core/ANTI-PATTERNS.md
1. **Multiple Scopes** - Resource duplication
   - Self-controlled servers: Server as resource pattern
   - Meta-frameworks: Module-level scope
   - CLI: Closure pattern
   - When multiple scopes are OK: Lambda, multi-tenant

2. **Built-ins in Resources** - Breaks portability
   - process.env, __dirname, import.meta.env
   - Solution: Tags for configuration

3. **Premature Escape** - Breaks testability
   - Resolving too early
   - Solution: Keep executors, resolve late

### core/TESTING.md
- preset() for resource mocking
- Testing flows with mocked resources
- Integration tests with real resources
- Test scope setup
- Verification strategies

## Application Type Modules

Each application-types/*.md contains:
1. **Scope Lifecycle** - When to create/dispose
2. **Architecture Pattern** - How to structure
3. **Resource Patterns** - Common resources
4. **Integration Points** - Where external world meets flows
5. **Examples** - Concrete implementations
6. **Testing** - Type-specific test patterns

### HTTP-SERVER.md
- Singleton scope pattern
- Server as resource
- Request handling with flows
- Middleware integration
- Express/Fastify/Hono specifics

### CLI.md
- Per-command scope pattern
- Closure for scope management
- Argument parsing
- Config via tags
- Testing CLI commands

### REACT-APP.md
- ScopeProvider pattern
- useResolves/useResolve hooks
- Resource layer (API clients)
- Feature state (derived executors)
- UI projection (thin components)
- Progressive enhancement (localStorage → API)

## Advanced Modules

### DATABASE.md
- Transaction flows
- Connection pooling as resource
- Query patterns
- Migration strategies
- Testing with DB

### AUTH.md
- Backend: Auth flows, token management
- Frontend: Auth state, protected resources
- Coordination: Token refresh, logout
- Testing: Mock auth states

### FULLSTACK.md
- Monorepo structure
- Shared types/flows
- API contracts
- Backend flows → Frontend executors
- Deployment

## Implementation Strategy

### Phase 1: Core Foundation
1. Create core/ modules
2. Extract common content from existing skills
3. Write main SKILL.md with routing

### Phase 2: Backend Patterns
1. Migrate HTTP server patterns
2. Add CLI patterns
3. Add cron/queue patterns
4. Add serverless patterns

### Phase 3: Frontend Patterns
1. Migrate React patterns
2. Add meta-framework patterns
3. Progressive enhancement

### Phase 4: Advanced Topics
1. Database patterns
2. Auth patterns
3. Full-stack coordination
4. Real-time patterns

### Phase 5: Integration
1. Update examples
2. Update documentation
3. Test auto-activation
4. Verify routing logic

## Success Criteria

1. **Reduced duplication** - Core concepts written once
2. **Modular** - Each module standalone, composable
3. **Comprehensive** - Covers backend, frontend, full-stack
4. **Practical** - Application-type-specific guidance
5. **Testable** - Each pattern includes testing strategy
6. **Maintainable** - Changes to core propagate automatically

## Migration Path

### For Existing Skills
1. Create symlinks/redirects from old skill paths
2. Main SKILL.md detects and routes appropriately
3. Deprecation notices in old skills
4. Eventually remove old skills

### For Users
1. No breaking changes - same activation
2. Better guidance - more comprehensive
3. Faster answers - modular structure
4. Full-stack support - new capability

## File Size Estimates

- Main SKILL.md: ~300 lines (routing + overview)
- core/CONCEPTS.md: ~400 lines
- core/TYPE-SAFETY.md: ~200 lines
- core/ANTI-PATTERNS.md: ~400 lines
- core/TESTING.md: ~200 lines
- Each application-types/*.md: ~300-400 lines
- Each advanced/*.md: ~300-400 lines

**Total: ~4000 lines** (vs current 2602 lines, but more comprehensive)

**Effective reduction:** ~40% duplication eliminated, +60% more content

## Next Steps

1. Create directory structure
2. Write core/CONCEPTS.md (foundation)
3. Write core/ANTI-PATTERNS.md (critical)
4. Write core/TYPE-SAFETY.md (critical)
5. Write main SKILL.md (routing)
6. Migrate HTTP-SERVER.md (most common)
7. Migrate REACT-APP.md (most common)
8. Continue with other modules
9. Test end-to-end
10. Update examples and docs
