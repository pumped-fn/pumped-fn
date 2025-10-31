# Project-Scoped Skills

This directory contains the pumped-design skill for the pumped-fn project.

## Pumped-design Skill

**pumped-design** - Design, navigate, troubleshoot, and test pumped-fn backend applications using strict organizational patterns.

### Features

- Strict organizational patterns (entrypoints, resources, flows, utilities)
- Sub-skill architecture with 14 specialized reference guides
- Layer-specific testing strategies
- Framework integration guides (Hono, Next.js, TanStack Start)
- AI-assisted catalog system with mermaid diagrams
- Type-safe error handling patterns

### Structure

```
pumped-design/
├── SKILL.md                           # Main routing skill
└── references/                        # Sub-skills loaded on-demand
    ├── coding-standards.md            # Type safety, naming, style
    ├── resource-basic.md              # Standalone resources
    ├── resource-derived.md            # Resources with dependencies
    ├── resource-lazy.md               # Lazy/conditional resources
    ├── flow-subflows.md               # Flow orchestration
    ├── flow-context.md                # Context operations
    ├── integration-hono.md            # Hono server integration
    ├── integration-nextjs.md          # Next.js integration
    ├── integration-tanstack.md        # TanStack Start integration
    ├── testing-utilities.md           # Unit testing patterns
    ├── testing-flows.md               # Flow integration testing
    ├── testing-integration.md         # E2E testing
    ├── extension-basics.md            # Cross-cutting concerns
    └── entrypoint-patterns.md         # Entrypoint structure
```

### Usage

The skill uses YAML frontmatter tags for AI-driven sub-skill routing. When working with pumped-fn applications, the main SKILL.md determines which references/ sub-skills to load based on task context.

### External Skills

General development workflows use superpowers plugin from marketplace:
- test-driven-development, systematic-debugging, verification-before-completion
- requesting-code-review, brainstorming, writing-plans, executing-plans
- using-git-worktrees, defense-in-depth, condition-based-waiting

### Marketplace

This skill is published to marketplace as the pumped-design plugin. See `.claude-plugin/marketplace.json` and `claude-skill/plugin.json` for configuration.
