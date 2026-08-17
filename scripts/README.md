# Scripts

## Purpose

`scripts/` holds repository operations scripts that are used by package scripts or GitHub Actions.

## Structure

| File | Role |
| --- | --- |
| `act.mjs` | Repository wrapper for local GitHub Actions dry-runs with `act`. |
| `check-changed-packages.mjs` | CI helper that rebuilds changed public workspace packages and dry-runs unpublished versions. |
| `check-changed-packages.test.mjs` | Deterministic fixtures for flat-package moves and explicit retirement evidence. |
| `check-repository-alignment.mjs` | Check flat package inventory, dependency policy, root cleanup, public lint wiring, script surface, and workflow provenance. |
| `check-repository-alignment.test.mjs` | Deterministic fixtures for repository shape, public lint wiring, and workflow provenance. |
| `check-inline-exec-contract.mjs` | Check inline `scope.run` and `ctx.exec` call sites for explicit names, parameters, inspectable callbacks, and graph dependencies when used. |
| `check-inline-exec-contract.test.mjs` | Deterministic positive and negative fixtures for the inline execution contract checker. |
| `check-packed-lite.mjs` | Pack all seven public packages, then verify docs, licenses, runtime/API/CLI behavior, NodeNext, and Bundler consumers. |
| `check-published-types.mjs` | Validate every public package root export with strict NodeNext ESM/CJS and Bundler consumers. |
| `check-public-contract.mjs` | Check package metadata, migration evidence, public interface TSDoc, README fences, changesets, and PR provenance. |
| `check-release-policy.mjs` | Check Changeset bump size, corrected early versions, internal peer alignment, and the repository release policy. |
| `check-release-policy.test.mjs` | Deterministic release-policy fixtures for core majors, pre-1 graduation, early version correction, stable majors, widening, and stale peers. |
| `check-public-contract.test.mjs` | Deterministic positive and negative fixtures for the public contract checker. |
| `get-release-title.sh` | Release workflow helper for Changesets PR titles. |

## Naming

Use short verb or verb-object names. Use `.mjs` for Node scripts and `.sh` for shell scripts that
are intentionally shell-native.

## Content Rules

Scripts should be deterministic, narrow, and called from `package.json` scripts or workflows. Keep
workspace dependency versions catalog-managed; do not vendor tool binaries here.

## Boundaries

Do not place package build logic or application runtime code here. If a script only serves one
package and is not a repo operation, keep it in that package.
