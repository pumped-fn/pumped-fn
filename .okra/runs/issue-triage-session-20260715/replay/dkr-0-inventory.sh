#!/usr/bin/env bash
set -euo pipefail

expected_head="d8dc7e845d3a7618fdf41525b67b8bac83d05d28"
actual_head="$(git rev-parse HEAD)"
passed=0
total=0

require_fixed() {
  local file="$1"
  local text="$2"
  total=$((total + 1))
  if ! rg --fixed-strings --quiet -- "$text" "$file"; then
    printf 'missing inventory marker in %s: %s\n' "$file" "$text" >&2
    exit 1
  fi
  passed=$((passed + 1))
}

if [[ "$actual_head" != "$expected_head" ]]; then
  printf 'expected HEAD %s, found %s\n' "$expected_head" "$actual_head" >&2
  exit 1
fi

require_fixed pkg/sdk/core/package.json '"./agent": {'
require_fixed pkg/sdk/core/package.json '"./session": {'
require_fixed pkg/sdk/core/package.json '"./validation": {'
require_fixed pkg/sdk/core/package.json '"./sandbox": {'
require_fixed pkg/sdk/core/src/agent.ts 'export const attempt = tag<Attempt>'
require_fixed pkg/sdk/core/src/agent.ts 'export function tool<'
require_fixed pkg/sdk/core/src/agent.ts 'ownership: "current"'
require_fixed pkg/sdk/core/src/agent.ts 'runtime: session.session'
require_fixed pkg/sdk/core/src/agent.ts 'export function role<'
require_fixed pkg/sdk/core/src/agent.ts 'export function turn(options: TurnOptions)'
require_fixed pkg/sdk/core/src/agent.ts 'ctx.exec({'
require_fixed pkg/sdk/core/src/session.ts 'export interface SessionRecord {'
require_fixed pkg/sdk/core/src/session.ts 'export interface SessionRuntime {'
require_fixed pkg/sdk/core/src/session.ts 'export const current = Object.freeze({'
require_fixed pkg/sdk/core/src/session.ts 'export const session = resource({'
require_fixed pkg/sdk/core/src/session.ts 'ctx.cleanup(() => runtime.shutdown())'
require_fixed pkg/sdk/core/src/session.ts 'if (this.#status === "open") return this.beginFinish()'
require_fixed pkg/sdk/core/src/session.ts 'export const loadAndBind = flow({'
require_fixed pkg/sdk/core/src/session.ts 'export const finish = flow({'
require_fixed pkg/sdk/core/src/session.ts 'export function run<'
require_fixed pkg/sdk/core/src/session.ts 'readonly work: AdmitWorkInput'
require_fixed pkg/sdk/core/src/session.ts 'parentSignal: tags.optional(abortSignal)'
require_fixed pkg/sdk/core/src/session.ts 'current.session(session)'
require_fixed pkg/sdk/core/src/validation.ts 'export const engine = tag<Engine>'
require_fixed pkg/sdk/core/src/validation.ts 'export function standard<'
require_fixed pkg/sdk/core/src/sandbox.ts 'export const policy = tag<Policy>'
require_fixed pkg/sdk/core/src/sandbox.ts 'export const impl = Object.freeze({'
require_fixed pkg/sdk/core/src/sandbox.ts 'export const exec: Run = flow({'
require_fixed pkg/sdk/core/README.md 'Resolve `session.session` in the context that owns the logical session before any nested run.'
require_fixed pkg/sdk/core/README.md 'await sessionCtx.resolve(session.session)'
require_fixed pkg/sdk/core/tests/session-kernel.test.ts 'does not present invocation-owned session state as durable'
require_fixed pkg/sdk/core/tests/session-kernel.test.ts 'keeps business effects out of context close'
require_fixed pkg/sdk/core/tests/database-analysis.test.ts 'fails before model or database effects when readiness is absent'
require_fixed pkg/sdk/core/tests/database-analysis.test.ts 'runs parallel read-only roles, joins before merge, and keeps acceptance outside the model'
require_fixed pkg/sdk/bash/tests/just-bash.test.ts 'settles cancellation in session A without closing session B'
require_fixed pkg/sdk/core/tests/package-exports.test.ts 'loads every packed entry through import and require'
require_fixed pkg/sdk/claude/src/index.ts 'export const claudeAttemptBinding = agent.attempt(claudeAttempt)'
require_fixed pkg/sdk/codex/src/index.ts 'export const codexAttemptBinding = agent.attempt(codexAttempt)'
require_fixed pkg/sdk/pi/src/index.ts 'export const piAttemptBinding = agent.attempt(piAttempt)'

printf '{"status":"pass","head":"%s","checks_passed":%d,"checks_total":%d}\n' "$actual_head" "$passed" "$total"
