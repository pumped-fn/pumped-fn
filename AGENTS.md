# Pumped-fn

## Dependencies
- `dependencies`/`devDependencies`: `catalog:` version specifier (add to `pnpm-workspace.yaml` first)
- `peerDependencies`: explicit ranges (e.g. `^19.0.0`) — not catalog-managed

## Prerequisites
Requires `c3-skill` and `superpowers` skill sets. Missing tools → see `./troubleshooting.md`.

Use diagrams to communicate. Conversational feedback → mermaid.live link.

## Workflow
- Start: `/c3-skill:c3-use` for overall understanding
- New features / amendments: `/c3-skill:c3` to craft ADR → `subagent-driven-development` to execute

## Code Style (No Slop)
No:
- Inline or block comments (TSDoc on public interfaces only)
- Defensive try/catch or null checks in trusted codepaths
- `any` to bypass type issues — fix the types. Exception: `any` is correct at library boundaries where variance makes a precise type unsound:
  - Contravariant function fields in covariant generic containers (e.g. `eq?: (a: any, b: any) => boolean` on `Interface<T>` used as `Interface<unknown>` in a union — `T` would break `Interface<number>` assignability)
  - Type-erased dispatch slots (extension hooks, runtime-dispatched factories)
  - Rule: precise type at the **call site** (`Options<T>`), `any` on the **stored field** only
- Single-use variables declared then immediately returned (inline them)
- Style inconsistent with surrounding code

## PR Checklist
- All epic tasks done
- ADR updated
- `README.md` diagram reflects changes
- PR has docs, c3-audited, slop-free
