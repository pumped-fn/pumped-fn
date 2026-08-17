# GitHub Operations

## Purpose

`.github/` holds hosted automation for CI, release, dependency maintenance, and repository policy.

## Structure

| Path | Role |
| --- | --- |
| `workflows/ci.yml` | Pull request and develop-branch validation for TypeScript workspace packages. |
| `workflows/release.yml` | Main-branch Changesets release and npm publishing workflow. New names use `NPM_TOKEN` once; existing names use trusted publishing. |
| `dependabot.yml` | Dependency update policy. |

## Naming

Workflow names should describe the operation, not the implementation detail. Keep stale workflows
out of this directory; a workflow must point at current repo paths.

## Content Rules

Workflows should be locally checkable with `pnpm actionlint`, `pnpm actions:check`, and targeted
`pnpm act -W ... -j ... -n` dry-runs. Use Node 24-capable action majors and keep release publishing
inside `release.yml`.

When `release.yml` creates an npm package name for the first time, its job summary prints four
`npm trust github` commands. Run them before the next release. npm requires the package to exist
before it can accept a trusted-publisher setup.

## Boundaries

Do not keep archived workflows, retired package paths, or one-off manual runbooks here. If an
operation is local-only, document or implement it under `scripts/`.
