# Autoresearch: Reduce lite test count without reducing coverage

## Config
- **Benchmark**: `bash autoresearch.sh`
- **Target metrics**: `test_count` (lower is better), `stmt_coverage` (must stay >= 99.5%), `branch_coverage` (must stay >= 88.7%), `fn_coverage` (must stay = 100%)
- **Scope**: `packages/lite/tests/`
- **Branch**: `autoresearch/reduce-lite-test-count-keep-coverage`
- **Started**: 2026-03-17

## Baseline
- 298 tests across 14 files
- Statement coverage: 99.5% (644/647)
- Branch coverage: 88.7% (338/381)
- Function coverage: 100% (118/118)

## Rules
1. One change per experiment
2. Run benchmark after every change
3. Keep if test_count decreases AND coverage does not regress
4. Log every run to autoresearch.jsonl
5. Commit kept changes with `Result:` trailer
