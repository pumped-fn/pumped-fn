#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

require_line() {
  local file="$1"
  local pattern="$2"
  rg -n --fixed-strings -- "$pattern" "$file"
}

require_absent() {
  local pattern="$1"
  shift
  if rg -n --fixed-strings -- "$pattern" "$@"; then
    echo "unexpected source surface: $pattern" >&2
    return 1
  fi
}

echo "source contracts"
require_line pkg/sdk/core/src/index.ts 'export const model = tag<Model>'
require_line pkg/sdk/core/src/index.ts 'export const complete = flow({'
require_line pkg/sdk/claude/src/index.ts 'export const claude = model(claudeTurn)'
require_line pkg/sdk/codex/src/index.ts 'export const codex = model(codexTurn)'
require_line pkg/sdk/codex/src/index.ts 'export const codexAcp = model(codexAcpTurn)'
require_line pkg/sdk/pi/src/index.ts 'export const pi = model(piTurn)'
require_line pkg/sdk/claude/src/index.ts 'ownership: "boundary"'
require_line pkg/sdk/codex/src/index.ts 'ownership: "boundary"'
require_line pkg/sdk/pi/src/index.ts 'ownership: "boundary"'
require_line pkg/sdk/claude/src/index.ts 'if (event.type !== "result") return'
require_line pkg/sdk/codex/src/index.ts 'session.push(notification.update.content.text)'
require_line pkg/sdk/codex/src/index.ts 'return chunks.join("")'
require_line pkg/sdk/pi/src/index.ts 'await models.complete('
require_line pkg/sdk/claude/src/index.ts 'signal?.addEventListener("abort", abort, { once: true })'
require_line pkg/sdk/codex/src/index.ts 'acp.connection.agent.notify("session/cancel"'
require_line pkg/sdk/pi/src/index.ts '{ apiKey, signal }'
require_line pkg/sdk/claude/src/index.ts 'let tail = Promise.resolve()'
require_line pkg/sdk/codex/src/index.ts 'const session = await acp.connection.agent.request("session/new"'
require_line pkg/sdk/pi/src/index.ts 'messages: ctx.input.messages.flatMap('
require_line pkg/sdk/codex/src/index.ts 'mcpServers: []'
require_line pkg/sdk/claude/src/index.ts '"--tools"'
require_line pkg/sdk/claude/src/index.ts '"",'
require_absent '@modelcontextprotocol/sdk' \
  pkg/sdk/claude/src/index.ts \
  pkg/sdk/codex/src/index.ts \
  pkg/sdk/pi/src/index.ts

echo "root pre-resolution lifetime"
pkg/sdk/core/node_modules/.bin/tsx --tsconfig pkg/sdk/core/tsconfig.json <<'TS'
import assert from "node:assert/strict"
import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { claudeSession } from "./pkg/sdk/claude/src/index.ts"
import { acp } from "./pkg/sdk/codex/src/index.ts"
import { models } from "./pkg/sdk/pi/src/index.ts"

async function proveSharedLifetime(name: string, target: Lite.Resource<unknown>) {
  let creates = 0
  let cleanups = 0
  let alive = true
  const value = {
    name,
    use() {
      assert.equal(alive, true)
      return name
    },
  }
  const scope = createScope({
    presets: [preset(target, (ctx) => {
      creates++
      ctx.cleanup(() => {
        alive = false
        cleanups++
      })
      return value
    })],
  })
  const root = scope.createContext()
  const rootValue = await root.resolve(target)
  const sessionA = scope.createContext({ parent: root })
  const sessionB = scope.createContext({ parent: root })
  const valueA = await sessionA.resolve(target)
  const valueB = await sessionB.resolve(target)

  assert.equal(valueA, rootValue)
  assert.equal(valueB, rootValue)
  assert.equal(creates, 1)
  await sessionA.close()
  assert.equal(cleanups, 0)
  assert.equal(value.use(), name)
  assert.equal(await sessionB.resolve(target), rootValue)
  await sessionB.close()
  assert.equal(cleanups, 0)
  await root.close()
  assert.equal(cleanups, 1)
  await scope.dispose()
  console.log(JSON.stringify({ provider: name, sameIdentity: true, sessionACloseKeptSessionBLive: true, rootCleanupCount: cleanups }))
}

await proveSharedLifetime("claude", claudeSession as Lite.Resource<unknown>)
await proveSharedLifetime("codex-acp", acp as Lite.Resource<unknown>)
await proveSharedLifetime("pi-ai", models as Lite.Resource<unknown>)
TS

echo "deterministic provider tests"
pnpm --dir pkg/sdk/claude exec vitest run tests/claude.test.ts
pnpm --dir pkg/sdk/codex exec vitest run tests/codex.test.ts tests/codex.acp.test.ts
pnpm --dir pkg/sdk/pi exec vitest run tests/pi.test.ts

echo "provider capability replay: PASS"
