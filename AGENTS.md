# Pumped-fn

## Dependencies
- `dependencies`/`devDependencies`: `catalog:` version specifier (add to `pnpm-workspace.yaml` first)
- `peerDependencies`: explicit ranges (e.g. `^19.0.0`) — not catalog-managed

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
- `README.md` diagram reflects changes
- PR has docs, slop-free
