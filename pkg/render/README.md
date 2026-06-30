# Render Lane

## Purpose

`pkg/render/` holds portable render specifications and renderer bindings. This lane keeps render
contracts separate from React state integration.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `core/` | `@pumped-fn/lite-render-core` | Platform-neutral strict spec and catalog render contract. |
| `react/` | `@pumped-fn/lite-render-react` | React renderer for verified render specs over Lite scopes. |

## Naming

Use `core` for the portable contract and platform handles such as `react` for renderer bindings.
Package names carry the `lite-render-*` prefix.

## Content Rules

Render packages own schema, verification, catalog, and renderer behavior. Keep state ownership and
flow execution in Lite or React adapter packages, then bind render specs to those surfaces.

## Boundaries

Do not put json-render adapter state code here. React-specific scoped state adapters belong in
`pkg/react/`; example render apps belong in `examples/`.
