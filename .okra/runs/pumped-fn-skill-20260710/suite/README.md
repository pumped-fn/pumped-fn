# pumped-fn eval suite (10 tasks, hardened harness v2)

Assembled by pkr-assemble from the 10 admitted eval tasks (dkr-5 = T-7, pkr-t1..t10)
on the pkr-harden self-contained harness. No task was redesigned; TASK.md, answer keys,
and checkers are verbatim copies of the admitted artifacts.

## Layout

```
suite/
  tasks/T-<n>/          TASK.md (cold prompt), answer-key.md, check.mjs, extra-deps.json
  harness/
    workspace-template-v2/   package.json (pinned) + tsconfig + vitest config
    tarballs/                lite, lint, scheduler (the ONLY pumped-fn carriers)
    instantiate.sh           task-aware workspace builder (reads extra-deps.json)
    run-all-gates.sh         5-gate runner (from pkr-harden, unmodified)
    run-task.sh              instantiate + gates + verdict for one task
  run-suite.sh          all 10 tasks + tier-weighted suite.json
  results/              gates.json, per-gate logs, verdict.json per task + suite.json
  verify/               re-verification evidence (reference run + adversarial spot-runs)
```

## How to run

One task:

```bash
suite/harness/run-task.sh T-3 <solution-dir> [results-root]
# <solution-dir> holds src/ tests/ bin/ (exactly one bin/*.ts = smoke entrypoint)
```

Whole suite:

```bash
suite/run-suite.sh <solutions-root> [results-root]
# <solutions-root>/T-1 .. T-10, each a solution dir as above
# writes <results-root>/suite.json
```

Gates per task, in order (fail-fast): lint (`pumped-lite-lint --max-warnings 0 src bin
tests`), tsgo (`--noEmit`), vitest, smoke (`tsx bin/<entry>.ts`), checker
(`node --import tsx check.mjs`). `admitted_score = 1` iff all 5 exit 0.

Fail-closed results (pkr-fix, closes chal-3 H3-FORMULA): `run-suite.sh` clears every
`<results-root>/T-n` dir and `suite.json` before the run; `run-task.sh` clears its own
result dir and writes a failed `verdict.json` (`admitted_score: 0` + `reason`) up front,
replaced only by a completed gate verdict — every early exit (INSTANTIATE_FAILED,
ENTRYPOINT_AMBIGUOUS) leaves an explicit failed verdict. A reused results-root can never
inherit stale passing verdicts. pkr-fix also machine-bound two residuals: T-4's checker
now executes `bin/daemon.ts` and asserts the audit trail in its stdout dump
(`b6-daemon-runs-shipped-audited-root`), and T-3's checker fires a recorded `clock.every`
tick and asserts the production capture flow runs from a natural tick
(`b8-natural-clock-tick-runs-production-capture`). Evidence: `workers/pkr-fix/gates/`.

## Scoring formula (ratified)

`suite_% = 100 * Σ(multiplier × admitted_score) / Σ(multiplier)`

| Task | Tier | Multiplier |
|---|---|---|
| T-1 | B | 0.75 |
| T-4, T-7 | D | 1.25 |
| T-2, T-3, T-5, T-6, T-8, T-9, T-10 | C | 1.0 |

Σ(multiplier) = 10.25. All 10 passing = 100%.

## Per-task extra deps (extra-deps.json)

| Task | Additions |
|---|---|
| T-3 | scheduler tarball (`@pumped-fn/lite-extension-scheduler` file:) + `--legacy-peer-deps` (scheduler 0.2.0 peers on lite ^3.1.0; pinned lite is 4.0.0) |
| T-4 | `zod: ^4.0.0` |
| all others | none (`@types/node` + `types: ["node"]` are already in template-v2) |

## Pins

| Artifact | Value |
|---|---|
| pumped-fn-lite-4.0.0.tgz sha256 | `16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a` |
| pumped-fn-lite-lint-1.0.0.tgz sha256 | `1f2945a7a8dedccd46babecf16866fc03995bbb93feb9ef3e36f604e5174b2f1` |
| pumped-fn-lite-extension-scheduler-0.2.0.tgz sha256 | `7b6f40c8e441bd71c74971003076032d8bac7350512f0e8bc8a17922d141fa62` |
| @typescript/native-preview | 7.0.0-dev.20260707.2 |
| tsx | 4.23.0 |
| typescript | 5.9.3 |
| vitest | 3.2.7 |
| @types/node | 25.9.5 |

Every gates.json records the lint/lite tarball shas plus installed-binary shas; a
mismatch against this table means someone re-packed — re-ratify or re-pin. There is no
dependence on the main checkout: the tarballs above are the only carriers of pumped-fn
code (verified: zero matches for `/home/lagz0ne/dev/pumped-fn/pkg` across results and
logs, see `verify/`).

## Re-verification record (`verify/`)

- `reference-suite-run.log` — run-suite.sh over the 10 reference solutions (expect 10/10, 100%).
- `adversarial-T-2-transplant-checker.log`, `adversarial-T-9-fake-checker.log`,
  `adversarial-T-4-fake-checker.log` — checker-only spot-runs of admitted adversarial
  variants overlaid on their reference solutions (expect exit 1 each).
- `main-checkout-grep.log` — path-independence sweep over results + logs.
