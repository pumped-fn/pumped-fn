# Experiment Protocol Reference

## autoresearch.md Template

```markdown
# Autoresearch: {goal}

## Config
- **Benchmark**: `{command}`
- **Target metric**: `{name}` ({higher|lower} is better)
- **Scope**: {files, directories, or modules in play}
- **Branch**: `autoresearch/{slug}`
- **Started**: {YYYY-MM-DDTHH:MM:SS}

## Rules
1. One change per experiment
2. Run benchmark after every change
3. Keep if metric improves, discard if it regresses
4. Log every run to autoresearch.jsonl
5. Commit kept changes with `Result:` trailer

## Notes
{Any context about the codebase, constraints, or prior attempts}
```

## autoresearch.sh Template

```bash
#!/usr/bin/env bash
set -euo pipefail
# Benchmark wrapper for autoresearch session
# Output must include METRIC lines for parse-metrics.sh

{benchmark_command} 2>&1 | tee /dev/stderr | bash "${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")}/scripts/parse-metrics.sh"
```

## autoresearch.checks.sh Template (Optional)

Pre-flight checks before each experiment. If this exits non-zero, skip the benchmark.

```bash
#!/usr/bin/env bash
set -euo pipefail
# Pre-flight checks

# Verify code compiles / lints
{lint_or_build_command}

# Verify tests still pass
{test_command}
```

## METRIC Output Format

Benchmarks must output metrics as:
```
METRIC name=value
```

Where:
- `name` matches `[a-zA-Z_][a-zA-Z0-9_]*`
- `value` is a number: integer, decimal, negative, or scientific notation
- One metric per line, prefix must be exactly `METRIC ` (with space)

Examples:
```
METRIC accuracy=0.95
METRIC duration_ms=1234
METRIC loss=0.0281
METRIC throughput=1500.5
METRIC delta=-0.03
METRIC learning_rate=1.5e-4
```

## JSONL Entry Examples

Baseline:
```json
{"run":1,"commit":"abc1234","metrics":{"accuracy":0.85,"duration_ms":2500},"status":"keep","description":"baseline","timestamp":1710000000}
```

Kept experiment:
```json
{"run":2,"commit":"def5678","metrics":{"accuracy":0.87,"duration_ms":2400},"status":"keep","description":"add batch normalization to encoder","timestamp":1710000300}
```

Discarded experiment:
```json
{"run":3,"commit":"ghi9012","metrics":{"accuracy":0.83,"duration_ms":2600},"status":"discard","description":"increase learning rate to 0.01","timestamp":1710000600}
```

Crashed experiment:
```json
{"run":4,"commit":"jkl3456","metrics":{},"status":"crash","description":"switch optimizer to AdamW","timestamp":1710000900}
```

## Example Session Flow

```
/autoresearch "improve model accuracy on validation set"

→ User provides: benchmark=`python eval.py`, metric=accuracy, direction=higher
→ Branch: autoresearch/improve-model-accuracy-on-validation-set
→ Baseline: accuracy=0.85

Run 2: add dropout(0.3) to encoder → accuracy=0.87 → KEEP
Run 3: increase hidden dim 256→512 → accuracy=0.86 → DISCARD (regressed from 0.87)
Run 4: add layer normalization → accuracy=0.89 → KEEP
Run 5: reduce learning rate 1e-3→5e-4 → accuracy=0.90 → KEEP
Run 6: add weight decay 0.01 → OOM crash → CRASH
Run 7: add gradient clipping 1.0 → accuracy=0.90 → DISCARD (unchanged)

Summary after 7 runs:
- 3 kept, 3 discarded, 1 crash
- Best: accuracy=0.90 (run 5)
- Improvement: +0.05 from baseline (+5.9%)
```
