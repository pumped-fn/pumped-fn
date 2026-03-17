# Autoresearch: Reduce lite-react test count without reducing coverage

## Config
- **Benchmark**: `bash autoresearch.sh`
- **Target metrics**: `test_count` (lower is better), `stmt_coverage` (must stay >= 90.54%), `branch_coverage` (must stay >= 81.56%), `fn_coverage` (must stay >= 87.5%)
- **Scope**: `packages/lite-react/tests/`
- **Branch**: `autoresearch/reduce-lite-test-count-keep-coverage`
- **Started**: 2026-03-17

## Baseline
- 50 tests across 2 files (hooks.test.tsx: 40, triage-findings.test.tsx: 10)
- Statement coverage: 90.54%
- Branch coverage: 81.56%
- Function coverage: 87.5%
- Line coverage: 91.91%

## Rules
1. One change per experiment
2. Run benchmark after every change
3. Keep if test_count decreases AND coverage does not regress
4. Log every run to autoresearch.jsonl
5. Commit kept changes with `Result:` trailer
