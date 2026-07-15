# SDK Lane

## Purpose

`pkg/sdk/` holds runtime-primitive packages built on Lite: durable workflow steps, session records
and runtimes, roles, tools, provider attempts, materials, sandboxes, CLI workers, and an eval harness. `@pumped-fn/sdk` is the
counterpart to `@pumped-fn/pumped`: the SDK provides the primitives, `pumped` discovers, assembles,
and runs them.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `core/` | `@pumped-fn/sdk` | Root workflow/model surface plus canonical `agent`, `session`, `validation`, and `sandbox` subpaths. |
| `codex/` | `@pumped-fn/sdk-codex` | Module-level Codex CLI and ACP model providers. |
| `claude/` | `@pumped-fn/sdk-claude` | Module-level Claude CLI model provider. |
| `pi/` | `@pumped-fn/sdk-pi` | In-process pi-ai model provider with native tool calls. |
| `mcp/` | `@pumped-fn/sdk-mcp` | Expose flows as an MCP server; each flow carries its schema as a tag. |
| `bash/` | `@pumped-fn/sdk-just-bash` | just-bash sandbox port-flow implementors. |
| `test/` | `@pumped-fn/sdk-test` | In-memory logs, provider attempts, session stores, and scope-seam harnesses. |

## Naming

Use `core` for the main SDK package and short provider handles for integrations. Directory names
should name the integration surface, while package names carry the `sdk` prefix.

## Content Rules

SDK packages compose through Lite scopes, namespaced tags, flows, resources, and extensions. A role and session are resources. A turn and every effect are flows. Provider packages expose module-level scalar and streaming handles while keeping provider-specific setup out of core.

## Testing

Provider packages carry `*.integration.test.ts` suites that invoke the machine's authenticated
CLIs and provider APIs. They skip unless `PUMPED_INTEGRATION=1` is set (pi additionally requires
`ANTHROPIC_API_KEY`), so default `pnpm test` runs stay hermetic.

## Boundaries

Do not place generic Lite runtime primitives, React UI bindings, or one-off examples in this lane.
If code is only a demonstration, it belongs in `examples/`.
