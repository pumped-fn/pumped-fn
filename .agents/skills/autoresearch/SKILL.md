---
name: autoresearch
description: "Experiment loop discipline for autoresearch sessions — decision rules, git workflow, JSONL logging, benchmark metrics, anti-patterns"
---

# Autoresearch — Experiment Loop Skill

You are in an autoresearch session. This skill governs how you run the experiment loop.

## Session State

State lives in files (survives context resets):
- `autoresearch.md` — config, rules, scope
- `autoresearch.sh` — benchmark wrapper
- `autoresearch.jsonl` — run log (append-only)
- Git branch `autoresearch/*` — all work happens here

**On context reset**: read `autoresearch.md` and `autoresearch.jsonl` to resume. The last JSONL entry tells you the run number and current state.

## Experiment Protocol

### Each Iteration

1. **Hypothesize** — one change, clear rationale, predicted impact
2. **Implement** — minimal diff, touch only scoped files
3. **Benchmark** — `bash autoresearch.sh 2>&1 | tee /dev/stderr | bash "${CLAUDE_PLUGIN_ROOT:-$(dirname autoresearch.sh)}/scripts/parse-metrics.sh"`
4. **Decide** — based on target metric and direction from `autoresearch.md`
5. **Record** — append JSONL, commit or revert
6. **Report** — run#, change, before→after, decision

### Decision Rules

| Outcome | Action |
|---------|--------|
| Metric improves | `git add . && git commit` with `Result:` trailer. JSONL: `"status":"keep"` |
| Metric regresses | `git checkout -- .` to revert. JSONL: `"status":"discard"` |
| Metric unchanged | Discard unless change is a prerequisite. JSONL: `"status":"discard"` |
| Benchmark crashes | `git checkout -- .` to revert. JSONL: `"status":"crash"`. Diagnose before next run |
| Benchmark timeout | Treat as crash |

### Commit Format

```
experiment: <short description>

<detailed rationale — what and why>

Result: <metric>=<value>, <metric>=<value>
```

### JSONL Schema

Each line is a JSON object:
```json
{"run":<n>,"commit":"<short-hash>","metrics":{<parsed>},"status":"keep|discard|crash","description":"<what changed>","timestamp":<unix>}
```

- `run` — sequential, starts at 1 (baseline)
- `commit` — short hash of HEAD at time of run (before revert if discarded)
- `metrics` — full parsed output from `parse-metrics.sh`
- `status` — decision outcome
- `description` — human-readable summary of the change
- `timestamp` — Unix epoch seconds

## Anti-Patterns

- **Compound changes** — never change two things at once. If you can't attribute the metric delta to exactly one change, split it.
- **Ignoring regressions** — if the metric went down, revert. No exceptions for "but it's cleaner code."
- **Skipping the benchmark** — every change gets benchmarked. No eyeballing.
- **Changing the benchmark** — never modify `autoresearch.sh` mid-session unless the benchmark itself is broken. Log this as a special entry.
- **Unbounded exploration** — if 3 consecutive experiments are discarded, stop and reassess strategy. Report to user.
- **Forgetting to log** — every run gets a JSONL entry, even crashes.
- **Large diffs** — keep each experiment's diff under 50 lines. Smaller is better.

## Session Resumption

If `autoresearch.md` and `autoresearch.jsonl` exist but you have no conversation context:

1. Read `autoresearch.md` for config
2. Read `autoresearch.jsonl` — last line gives you the run number and state
3. Check `git log --oneline -5` for recent experiment commits
4. Report status to user: "Resuming autoresearch session: run {n}, last result: {status}"
5. Continue the loop

## Progress Reporting

Every 5 runs (or on user request), show a summary:
- Total runs, keeps, discards, crashes
- Best metric value and which run achieved it
- Cumulative improvement from baseline
- Trend direction
