# Sync Backend Discovery

Date: 2026-07-01

Status: implementation checkpoint. The value-sync NATS adapter exists in this PR; CRDT and database
sync lanes remain discovery.

Decision target: choose the next sync implementation lane after `@pumped-fn/lite-extension-sync`.

## Objective Frame

Candidate objective: reduce backend uncertainty enough to select one production adapter PR and one
CRDT discovery PR.

Candidate success metric:

- one value-sync backend can be implemented against a real service with durable reads, watched
  updates, revision evidence, and failure tests;
- one CRDT lane is separated from value-sync with its own update semantics and stress proof;
- database-shaped sync products are classified as integration targets, not forced through the atom
  value transport.

Candidate anti-goals:

- do not make one generic sync API pretend to cover snapshots, CRDT documents, and database shapes;
- do not accept fake backend tests as production proof;
- do not weaken the strict JSON/runtime validation story for value sync;
- do not hide conflict/accountability behind a best-effort `write(): void` transport.

## Current Primitive Boundary

The current `sync(...)` package is a strict value-sync primitive:

- state is atom-like and JSON-safe by default;
- non-JSON values need a codec;
- inbound wire values are decoded before apply;
- runtime selection is tag-injected through `sync.runtime(...)`;
- transport shape is `read`, `write`, `subscribe`, optional `close`, with backend write acknowledgements.

That is enough for memory, simple replicated state, and backend revision evidence. It is not yet a full
compare-and-set conflict contract.

Implementation checkpoint:

- `Sync.Transport.write` now accepts a backend revision acknowledgement.
- `@pumped-fn/lite-extension-sync-nats` maps sync messages onto NATS JetStream KV keys, stores JSON
  payload bytes, watches key updates, and returns KV revisions as write acknowledgements.
- The adapter test suite covers deterministic store behavior and a real Docker-backed `nats:2.12-alpine`
  JetStream KV integration through `createScope`, `sync.extension`, and `sync.runtime`.
- The NATS adapter proof now covers stale revision racing, corrupt persisted watch payload isolation,
  backend revision mapping, and a 1,000-write JetStream KV stress run with per-operation overhead
  measurement.
- Remaining production proof is reconnect behavior and a first-class CAS conflict result if callers need
  retry/accountability beyond the current write-error boundary.

## Backend Findings

### NATS JetStream KV

NATS is the best first production backend for the existing value-sync package.

Evidence:

- NATS JetStream KV has `put`, `get`, `delete`, `purge`, `keys`, `create`, `update`, `watch`, `watch
  all`, and `history`.
- NATS documents `create` and `update` as atomic compare-and-set operations.
- NATS KV watches push changes in real time.
- Values are byte arrays, so JSON wire messages can be encoded explicitly.
- The JavaScript `@nats-io/kv` package implements KV over JetStream and is distributed for npm and
  JSR runtimes.

Decision impact:

- Build `@pumped-fn/lite-extension-sync-nats` first.
- The adapter should not merely wrap `put`; it should prove revision behavior with `update`.
- The base `Sync.Transport` likely needs an ack shape before this becomes production-grade:

```ts
interface WriteAck {
  readonly version: number
}
```

or a CAS-aware write result:

```ts
type WriteResult =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly conflict: Sync.Message }
```

Open risk:

- NATS KV documents monotonic reads/writes but warns that direct gets may not guarantee
  read-your-writes unless reading from the stream leader. The adapter tests need to define the
  consistency policy instead of assuming local echo equals durability.

Sources:

- https://docs.nats.io/nats-concepts/jetstream/key-value-store
- https://github.com/nats-io/nats.js/blob/main/kv/README.md
- https://jsr.io/@nats-io/kv

### Yjs

Yjs should be a CRDT lane, not a codec bolted onto `sync(...)`.

Evidence:

- Yjs document updates are binary, compressed, commutative, associative, and idempotent.
- A Yjs update can be applied in any order and multiple times.
- Yjs provides `applyUpdate`, `encodeStateAsUpdate`, `encodeStateVector`, and update event hooks.
- Yjs is explicitly network agnostic and provider-oriented.
- y-websocket and y-partykit already show provider and persistence patterns.

Decision impact:

- Build a separate `@pumped-fn/lite-extension-sync-yjs` discovery instead of changing
  `sync(...)` into a CRDT API.
- The primitive should expose document/update semantics, not snapshot overwrite semantics.
- NATS can still be useful as a carrier for Yjs updates, but the merge logic belongs to Yjs.

Open risk:

- Initial value seeding is a real footgun in CRDT systems. Two clients independently creating the
  same initial content can produce duplicate operations. The primitive must define who initializes
  a document and how that initialization is idempotent.

Sources:

- https://docs.yjs.dev/
- https://docs.yjs.dev/api/document-updates
- https://docs.yjs.dev/ecosystem/connection-provider/y-websocket
- https://docs.partykit.io/reference/y-partykit-api/

### Automerge

Automerge is a second CRDT candidate, especially for structured JSON-like documents.

Evidence:

- Automerge separates the CRDT implementation from `automerge-repo`, which provides networking and
  storage plumbing.
- Repositories manage remote peers and local storage and expose document handles.
- The sync protocol is transport agnostic and per-document.
- Automerge has a compressed binary storage format for document history.

Decision impact:

- Treat Automerge as a structured document lane after Yjs, not as the first backend adapter.
- The likely primitive is document-handle/ref based. It should not share the value-sync transport
  unless the only behavior needed is snapshot export/import.

Open risk:

- The repo/document-handle model may overlap with Lite scope lifetime. The discovery needs to prove
  whether repository lifetime belongs in a tag, atom, or external composition root.

Source:

- https://automerge.org/docs/reference/concepts/

### Electric and PowerSync

Electric and PowerSync are database-shape sync systems, not atom-value backends.

Evidence:

- Electric uses shape subscriptions that stream data from its sync engine into memory or a local
  normalized store/database.
- Electric shapes are single-table, with multiple shapes required for related data.
- PowerSync Sync Streams define SQL-like streams that determine which data is replicated from the
  source database to clients.
- PowerSync persists bucket metadata and operation history to support efficient delta sync.

Decision impact:

- These should integrate through Lite atoms/resources/flows that expose local collections or query
  results.
- They should not be forced through `Sync.Transport<Message>` because the unit of sync is a shape,
  stream, collection, row set, or local database, not one atom value.

Open risk:

- If pumped-fn later wants database sync, the API surface probably belongs closer to render/query
  integration than to `sync(...)`.

Sources:

- https://electric.ax/docs/sync/guides/shapes
- https://docs.powersync.com/sync/overview

### Replicache and WatermelonDB

Replicache and WatermelonDB are useful protocol references, not immediate package targets.

Evidence:

- Replicache uses speculative local mutators, server-authoritative push, pull patches, cookies, and
  rebasing of pending mutations.
- Replicache server push has strict last-mutation-id handling so invalid mutations do not block a
  client forever.
- WatermelonDB gives local database sync primitives and requires backend pull/push endpoints that
  conform to its protocol.

Decision impact:

- These are good stress references for mutation acknowledgement, replay, and anti-stall behavior.
- They should inform the NATS/value-sync ack design, but should not be copied into the atom-sync API.

Sources:

- https://doc.replicache.dev/concepts/how-it-works
- https://doc.replicache.dev/reference/server-push
- https://watermelondb.dev/docs/Sync/Intro
- https://watermelondb.dev/docs/Sync/Frontend
- https://watermelondb.dev/docs/Sync/Backend

## Candidate Next DKRs

### DKR 1: NATS Value Sync Adapter

Decision unlocked: whether `sync(...)` can become production-capable with a NATS adapter and a small
transport ack/CAS refinement.

Budget: one implementation spike.

Evidence required:

- real `nats-server -js`, not mocked transport;
- adapter package under `pkg/ext/sync-nats`;
- conformance tests for read, write, watch, stale revision, CAS conflict, invalid payload, and shared
  transport lifetime;
- stress proof that writes at least 1,000 updates and measures per-op overhead;
- proof that backend revision is surfaced or intentionally mapped;
- reconnect behavior remains the next adapter-hardening proof.

Likely package shape:

- package: `@pumped-fn/lite-extension-sync-nats`;
- export: contextual namespace `nats`;
- runtime injection stays at `createScope({ tags: [sync.runtime({ transport: nats.kv(...) })] })`.

### DKR 2: Yjs CRDT Primitive

Decision unlocked: whether pumped-fn should provide a first-class CRDT primitive beside value sync.

Budget: one discovery package or research example, not a release package yet.

Evidence required:

- two Y docs converge after offline concurrent edits;
- duplicate and out-of-order updates are idempotent;
- initialization is idempotent and cannot duplicate default content;
- provider lifetime is testable through scope/tags only;
- one carrier is proven, preferably memory first and then NATS or WebSocket.

Likely package shape:

- package: `@pumped-fn/lite-extension-sync-yjs`;
- export: contextual namespace `yjs`;
- expose document/update semantics, not `Sync.Transport<Message>`.

### DKR 3: Database Shape Boundary

Decision unlocked: whether database sync belongs under `sync`, render/query packages, or examples
only.

Budget: source-only architecture checkpoint.

Evidence required:

- one Electric or PowerSync example mapped to Lite atoms/resources;
- no new generic sync abstraction unless the use case repeats across at least two systems;
- clear rule for where local database lifetime lives.

## Accepted For Now

- NATS is the next backend adapter to implement for the existing value-sync primitive.
- Yjs is the next CRDT discovery, but it should be a sibling lane, not a transport implementation.
- Automerge is worth a later structured-document discovery.
- Electric, PowerSync, Replicache, and WatermelonDB are integration/protocol references unless a
  concrete product use case needs database-shaped sync.
