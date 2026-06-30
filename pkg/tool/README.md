# Tool Lane

## Purpose

`pkg/tool/` holds developer tooling that helps maintain or migrate pumped-fn code. Tools may publish
as packages, but they are not runtime dependencies for application code.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `lint/` | `@pumped-fn/lite-lint` | Static scanner for documented Lite and Lite React anti-patterns. |
| `codemod/` | `@pumped-fn/codemod` | Migration helpers for older pumped-fn code. |

## Naming

Use short action nouns for tool directories. Package names may use `lite-*` when the tool is tied to
Lite rules, or a direct tool name when it spans older package surfaces.

## Content Rules

Tool packages own CLIs, transforms, scanners, fixtures, and tests for those tools. Keep rules aligned
with the README and PATTERNS files they enforce.

## Boundaries

Do not place runtime code, examples, or benchmarks here. If a rule exists only for one package's
private tests, keep it with that package instead of promoting it to a workspace tool.
