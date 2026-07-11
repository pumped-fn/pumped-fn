# @pumped-fn/sdk-codex

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level Codex CLI and ACP model providers for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { codex, codexConfig } from "@pumped-fn/sdk-codex"

const triage = agent({ name: "triage" })
const scope = createScope({
  tags: [codex, codexConfig({ auth: { kind: "global" } })],
})
```

Global auth reuses writable `CODEX_HOME` state. API-key auth reads the configured environment name
and passes it to `codex exec` as `CODEX_API_KEY`:

```ts
codexConfig({ auth: { kind: "api-key", env: "MY_CODEX_KEY" } })
```

ACP uses `@agentclientprotocol/codex-acp` over stdio through the official TypeScript client. Permissions
default to deny and every decision is recorded in the SDK event buffer.

```ts
import { codexAcp, codexAcpConfig } from "@pumped-fn/sdk-codex"

const acpScope = createScope({
  tags: [codexAcp, codexAcpConfig({ permission: "deny" })],
})
```

The stable CLI handles are `codex`, `codexTurn`, and `codexRun`; ACP exports `codexAcp`,
`codexAcpTurn`, and `acp`. The removed `codex()`/`codexHarness()`/`codexCliWorker()` factories have
no compatibility aliases.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
