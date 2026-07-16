# Scripts

## Purpose

`scripts/` holds repository operations scripts that are used by package scripts or GitHub Actions.

## Structure

| File | Role |
| --- | --- |
| `act.mjs` | Repository wrapper for local GitHub Actions dry-runs with `act`. |
| `check-changed-packages.mjs` | CI helper that rebuilds changed public workspace packages and dry-runs unpublished versions. |
| `check-example-alignment.mjs` | Check example, guidance, package-map, dependency-policy, and script-surface drift. |
| `check-inline-exec-contract.mjs` | Check inline `scope.run` and `ctx.exec` call sites for explicit names, parameters, inspectable callbacks, and graph dependencies when used. |
| `check-inline-exec-contract.test.mjs` | Deterministic positive and negative fixtures for the inline execution contract checker. |
| `check-public-contract.mjs` | Check package metadata, migration evidence, public interface TSDoc, README fences, changesets, and PR provenance. |
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
