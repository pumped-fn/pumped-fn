# pkr-harden — harness hardening summary

worker pkr-harden · run pumped-fn-skill-20260710 · 2026-07-10 · linked CKR-1, source dkr-5-checkpoint

## Problem fixed

Eval gates previously invoked the MAIN checkout's lint dist
(`/home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs`), which mutates mid-run when
other sessions rebuild it (observed sha aaacc2c7... -> 7ae4e6f7...). Gates are now
self-contained: lint is packed once into a pinned tarball and installed into each
workspace as a devDep; every gate run records the tarball + installed-binary shas.

## What changed vs the dkr-5 template

| Item | dkr-5 (v1) | v2 |
|---|---|---|
| lint | `node <main>/pkg/tool/lint/dist/cli.mjs` (shared mutable path) | `npx pumped-lite-lint` from workspace devDep `@pumped-fn/lite-lint` (file: tarball) |
| pack tool | npm pack (lite only) | + `pack-lint.sh` using **pnpm pack** — required because lint has a runtime dep `typescript: catalog:`; npm pack would emit uninstallable `"catalog:"`, pnpm pack resolves it to `6.0.3`. No prepack/prepare/prepublishOnly script exists (script asserts this), so packing triggers no build. |
| tsconfig `types` | `[]` | `["node"]` + `@types/node` devDep (T-2 precedent) |
| devDep versions | ranges (`^`) | pinned exact (determinism-over-time; answers dkr-5 questions_unanswered) |
| gate runner | 5 hand-typed commands | `run-all-gates.sh <workspace> <entrypoint> <checker>` — runs lint/tsgo/vitest/smoke/checker in order, writes `<workspace>/gates.json` `{gate:{exit,sha256s}}` + top-level lint/lite tarball shas every run, exits nonzero on first failure (partial gates.json still written), per-gate logs `gate-<name>.log` |
| instantiate | `harness/instantiate.sh` (hardcodes check-t7, prints main-path lint cmd) | `instantiate-v2.sh <solution> <target> [checker]` — sed-fills both `PACK_TARBALL_LITE`/`PACK_TARBALL_LINT` placeholders, checker is a parameter |

Shrinkwrap decision: pinned exact versions in package.json instead of
npm-shrinkwrap.json — shrinkwrap embeds resolved `file:` tarball paths, which breaks the
placeholder-based instantiation; exact top-level pins satisfy the determinism goal.

## Pinned artifacts

| Artifact | Value |
|---|---|
| pumped-fn-lite-lint-1.0.0.tgz sha256 | `1f2945a7a8dedccd46babecf16866fc03995bbb93feb9ef3e36f604e5174b2f1` |
| pumped-fn-lite-4.0.0.tgz sha256 | `16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a` (copied from dkr-5, unchanged) |
| installed lint cli.mjs sha256 | `7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79` |
| installed lite index.mjs sha256 | `f260d8480fbc08c3bd43bfcbd0cb26345f470ddc8b312e550aeaa1ac748d34d7` |
| typescript (lint runtime dep, catalog-resolved) | 6.0.3 (nested install; workspace top-level stays 5.9.3) |

Pinned devDeps (what the v1 ranges resolve to on 2026-07-10):

| Package | Pinned |
|---|---|
| @typescript/native-preview | 7.0.0-dev.20260707.2 |
| tsx | 4.23.0 |
| typescript | 5.9.3 |
| vitest | 3.2.7 |
| @types/node | 25.9.5 |

## Verification (all evidence under gates/)

1. Standalone lint: scratch workspace with ONLY the lint tarball devDep — known-bad file
   exits 1 naming `pumped/no-untyped-throw`; clean file exits 0, 0 diagnostics
   (`gates/lint-standalone-verify.log`).
2. End-to-end: dkr-5/reference-solution instantiated via instantiate-v2.sh, all 5 gates
   pass via run-all-gates.sh (`gates/e2e-reference-gates.json`, `.log`).
3. No main-checkout dependence: `grep -rn '/home/lagz0ne/dev/pumped-fn/pkg'` over
   gates.json + all gate logs + workspace package.json = zero matches. Only remaining
   main-checkout touch is the initial `pack-lint.sh` (read-only pnpm pack).
4. Fail-fast: planted `no-untyped-throw` file -> wrapper exits 1 at gate 1, gates.json
   records only `{lint: {exit: 1}}` (`gates/e2e-failpath-gates.json`).

## Migration note for existing task harnesses (T-2/T-7/T-8/T-10)

1. Replace calls to `workers/dkr-5/harness/instantiate.sh` with
   `workers/pkr-harden/instantiate-v2.sh <solution-dir> <target> <checker.mjs>`
   (checker is now an explicit arg — pass your task's check-*.mjs).
2. Delete any gate command containing `/home/lagz0ne/dev/pumped-fn/pkg/tool/lint`;
   run gates only via `workers/pkr-harden/run-all-gates.sh <workspace> <entrypoint> <checker-basename>`.
3. If your task tsconfig relied on `types: []`, note v2 sets `types: ["node"]` — code
   using node globals now typechecks (intended, T-2); code shadowing node globals may
   surface new tsgo errors.
4. Before any scored round, confirm `gates.json` tarball shas match the table above; a
   mismatch means someone re-packed — re-ratify or re-pin.
