#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$root"

sha256sum --check <<'HASHES'
7e63dc3ba497518ceb2b9256167cedb57b7967d1d47e6fdbe7c61cee78ab8417  pkg/sdk/claude/src/index.ts
3a1607bea7ee4416912bb163cd172f9e5f53041649843a8d71fa7c89c6347234  pkg/sdk/codex/src/index.ts
b91e03cff6ef3f31719cc40009ba4de3d8358e9b7618b10d268552e207627c6a  pkg/sdk/claude/tests/claude.test.ts
4131befede5662067f5147ab560bf110a4854f97af2370cc2457ee5c87d3d85e  pkg/sdk/codex/tests/codex.test.ts
e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2  pkg/sdk/core/src/index.ts
9251bcba0eb814baa4d0a11d32945b57b09a2825fa781c7f3933a02d63c605fa  .okra/runs/managed-agent-sessions-20260713/drafts/dkr-1-checkpoint-accepted.json
HASHES

rg -n 'export const model = tag<Model>|export const complete = flow|deps: \{ impl: tags.required\(model\) \}' pkg/sdk/core/src/index.ts
rg -n 'export const claudeRun = flow|deps: \{ run: controller\(claudeRun\) \}|export const claude = model\(claudeTurn\)' pkg/sdk/claude/src/index.ts
rg -n 'export const acp = resource|ctx.cleanup|export const codexAcpPrompt = flow|deps: \{ prompt: controller\(codexAcpPrompt\) \}|export const codexAcp = model\(codexAcpTurn\)' pkg/sdk/codex/src/index.ts
rg -n 'preset\(claudeRun, fake\)|model\(replacement\)' pkg/sdk/claude/tests/claude.test.ts
rg -n 'preset\(codexAcpPrompt, fakeAcp\)|preset\(codexRun, fake\)|model\(replacement\)' pkg/sdk/codex/tests/codex.test.ts
