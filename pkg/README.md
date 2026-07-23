# Package Lanes

## Purpose

`pkg/` is the source root for publishable packages. It keeps package families grouped by short lane
names so new packages can be added without turning the workspace into a flat list.

## Structure

| Lane | Owns |
| --- | --- |
| `core/` | The framework-neutral runtime. |
| `react/` | React bindings and React-specific adapters. |
| `framework/` | Server and full-stack framework adapters over Lite scopes. |
| `ext/` | Optional Lite extensions and development add-ons. |
| `sdk/` | Session records and resources, roles and turns, validation, sandbox ports and policy, workflow primitives, and provider adapters. |
| `render/` | Portable render contracts and renderer bindings. |
| `tool/` | Repository tooling, scanners, and migration CLIs. |

Packages live at `pkg/<lane>/<package>/`. `pnpm-workspace.yaml` includes `pkg/*/*`, so every
package directory must contain its own `package.json`.

## Naming

Lane names are one word. Package directory names are short handles, not full npm names. Keep
`pkg/core/lite` and `pkg/react/lite-react` stable because they are the user-facing core packages.
Use the package `name` field for npm scope and longer product names.

## Content Rules

Every package directory owns its package README, source, tests, build config, and changelog if it
publishes. Cross-lane policy belongs here or in the lane README, not repeated in every package.

## Boundaries

Do not put examples, benchmark harnesses, release workflow state, or scratch research under `pkg/`.
If a directory does not produce or support a package, it belongs outside this tree.
