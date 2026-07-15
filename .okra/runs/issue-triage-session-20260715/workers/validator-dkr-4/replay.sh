#!/usr/bin/env bash
set -u

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

recorded_output="$(workers/dkr-4/replay.sh 2>&1)"
recorded_exit=$?
saved_output="$(bash .okra/runs/issue-triage-session-20260715/workers/dkr-4/replay.sh 2>&1)"
saved_exit=$?
fresh_output="$(node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-4/fresh-queue-probe.mjs 2>&1)"
fresh_exit=$?
source_output="$(node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-4/source-audit.mjs 2>&1)"
source_exit=$?

RECORDED_OUTPUT="$recorded_output" \
RECORDED_EXIT="$recorded_exit" \
SAVED_OUTPUT="$saved_output" \
SAVED_EXIT="$saved_exit" \
FRESH_OUTPUT="$fresh_output" \
FRESH_EXIT="$fresh_exit" \
SOURCE_OUTPUT="$source_output" \
SOURCE_EXIT="$source_exit" \
node --input-type=module <<'NODE'
const tail = (value) => value.split("\n").slice(-12).join("\n")

process.stdout.write(`${JSON.stringify({
  verification: "validator-dkr-4-replay",
  recorded_replay: { exit_code: Number(process.env.RECORDED_EXIT), output_tail: tail(process.env.RECORDED_OUTPUT) },
  saved_replay: { exit_code: Number(process.env.SAVED_EXIT), passed: process.env.SAVED_OUTPUT.includes('"queueCases":"8/8"') },
  fresh_probe: { exit_code: Number(process.env.FRESH_EXIT), output_tail: tail(process.env.FRESH_OUTPUT) },
  source_audit: { exit_code: Number(process.env.SOURCE_EXIT), result: Number(process.env.SOURCE_EXIT) === 0 ? JSON.parse(process.env.SOURCE_OUTPUT) : tail(process.env.SOURCE_OUTPUT) },
})}\n`)
NODE
