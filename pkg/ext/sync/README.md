# @pumped-fn/lite-extension-sync

Strict replicated state for Lite scopes.

## Install

```bash
npm install @pumped-fn/lite @pumped-fn/lite-extension-sync
```

## Usage

```ts
import { createScope } from "@pumped-fn/lite"
import { sync } from "@pumped-fn/lite-extension-sync"

const draft = sync({
  id: "draft",
  factory: () => ({ title: "", body: "" }),
})

const wire = sync.memory()

const left = createScope({
  extensions: [sync.extension()],
  tags: [sync.runtime({ peer: "left", transport: wire })],
})

const right = createScope({
  extensions: [sync.extension()],
  tags: [sync.runtime({ peer: "right", transport: wire })],
})
```

`sync(...)` returns an atom-like value. Plain JSON-safe state is inferred. Non-JSON state must use a
codec, and every inbound value is decoded before it can be applied.

## Semantics

The core extension is transport-driven: a local controller change is encoded, written as a per-key `Sync.Message`, and remote peers apply subscribed messages from other peers; without a `conflict` policy, an inbound value replaces the local value. Conflict handling is opt-in per atom: `sync.revision(...)` accepts only higher app-level revisions and reports equal-version conflicts, while `sync.lww(...)` keeps the value with the greater-or-equal app-level timestamp/version. The NATS KV transport stores one KV entry per sync key with backend revision acks, maps stale revision writes to `WriteConflict`, and resumes watches from the last delivered KV revision; it does not introduce a leader or cross-key ordering.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
