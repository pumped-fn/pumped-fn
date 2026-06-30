# React Lane

## Purpose

`pkg/react/` holds React-facing packages. These packages let React observe and dispatch into Lite
scopes without moving product logic into components.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `lite-react/` | `@pumped-fn/lite-react` | React providers, hooks, boundaries, and frontend state bindings. |
| `json/` | `@pumped-fn/lite-react-json-render` | json-render state and action adapters for Lite React. |

## Naming

Keep `lite-react` stable because it is already user-facing. Additional React adapters use a short
target handle such as `json`, not a repeated `lite-react-*` directory name.

## Content Rules

React packages own React integration code, browser tests, and React-specific documentation. Keep
graph logic in Lite atoms, flows, resources, and scoped values; React should observe and dispatch.

## Boundaries

Platform-neutral render contracts belong in `pkg/render/`. Runtime extensions belong in `pkg/ext/`.
Do not place example apps in this lane.
