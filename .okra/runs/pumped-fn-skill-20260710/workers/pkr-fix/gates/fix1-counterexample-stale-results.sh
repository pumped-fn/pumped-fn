#!/usr/bin/env bash
# FIX-1 counterexample (CHAL-3 H3-FORMULA repro): pre-seed a results root with the
# fresh PASSING reference verdicts, then run the suite with a solutions-root whose
# only task dir (T-1) carries TWO bin/*.ts files (ENTRYPOINT_AMBIGUOUS).
# Pre-fix behavior: T-1 exits 2 before writing a verdict, stale admitted_score=1
# is inherited. Post-fix: T-1 scores 0 with an ENTRYPOINT_AMBIGUOUS reason and
# every other stale verdict is cleared to MISSING_SOLUTION; suite_pct collapses.
set -uo pipefail
SUITE=/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/.okra/runs/pumped-fn-skill-20260710/suite
rm -rf /tmp/pkrfix-stale-results
cp -r "$SUITE/results" /tmp/pkrfix-stale-results
echo "--- pre-seeded (stale) suite.json:"
node -e 'const s=require("/tmp/pkrfix-stale-results/suite.json");console.log(JSON.stringify({passed:s.passed,suite_pct:s.suite_pct}))'
echo "--- pre-seeded T-1 verdict admitted_score:"
node -e 'console.log(require("/tmp/pkrfix-stale-results/T-1/verdict.json").admitted_score)'
bash "$SUITE/run-suite.sh" /tmp/pkrfix-ambiguous /tmp/pkrfix-stale-results
SUITE_EXIT=$?
echo "SUITE_EXIT=$SUITE_EXIT"
echo "--- post-run T-1 verdict.json:"
cat /tmp/pkrfix-stale-results/T-1/verdict.json
echo "--- post-run suite summary:"
node -e '
const s = require("/tmp/pkrfix-stale-results/suite.json")
console.log(JSON.stringify({ passed: s.passed, suite_pct: s.suite_pct, t1_admitted: s.tasks["T-1"].admitted_score }))
const t1 = require("/tmp/pkrfix-stale-results/T-1/verdict.json")
if (t1.admitted_score !== 0) { console.error("FAIL: stale T-1 passing verdict survived"); process.exit(1) }
if (!String(t1.reason ?? "").includes("ENTRYPOINT_AMBIGUOUS")) { console.error("FAIL: T-1 verdict lacks ENTRYPOINT_AMBIGUOUS reason"); process.exit(1) }
if (s.suite_pct !== 0 || s.passed !== 0) { console.error("FAIL: stale verdicts inherited, suite_pct=" + s.suite_pct); process.exit(1) }
console.log("COUNTEREXAMPLE-CLOSED: stale passing verdicts not inherited; ambiguous entrypoint scores 0")
'
