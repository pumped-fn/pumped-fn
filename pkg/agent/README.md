# Agent Lane

## Purpose

`pkg/agent/` holds agent workflow packages built on Lite primitives. The lane owns orchestration
surfaces, provider tags, sandbox integrations, and test doubles for agent runs.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `core/` | `@pumped-fn/agent-sdk` | Agent workflows, tools, skills, sessions, evals, HTTP adapters, and run inspection. |
| `codex/` | `@pumped-fn/agent-sdk-codex` | Codex CLI model provider tag. |
| `claude/` | `@pumped-fn/agent-sdk-claude` | Claude CLI model provider tag. |
| `bash/` | `@pumped-fn/agent-sdk-just-bash` | just-bash sandbox provider tag. |
| `test/` | `@pumped-fn/agent-sdk-test` | In-memory logs, fake routing, and test helpers. |

## Naming

Use `core` for the main SDK package and short provider handles for integrations. Directory names
should name the integration surface, while package names carry the `agent-sdk` prefix.

## Content Rules

Agent packages should compose through Lite scopes, tags, flows, resources, and extensions. Provider
packages expose lazy provider tags and keep provider-specific setup out of the core package.

## Boundaries

Do not place generic Lite runtime primitives, React UI bindings, or one-off examples in this lane.
If code is only a demonstration, it belongs in `examples/`.
