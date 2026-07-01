# Lite Sync Web Practical

Frontend/backend sync through the same Lite scope seam.

This example keeps the synced value declaration shared:

```ts
const draft = sync({
  id: "draft",
  factory: () => ({ id: "draft", title: "Untitled", body: "", savedBy: "system", version: 0 }),
  conflict: sync.revision("version"),
})
```

The browser composition root injects a web environment runtime:

```ts
const scope = createScope({
  extensions: [sync.extension()],
  tags: [
    sync.runtime(web.env({
      gateway: web.client({ url: "/sync", fetch }),
      token,
      peer: web.peer(store, () => crypto.randomUUID()),
      namespace: "workspace:demo",
    })),
  ],
})
```

The backend owns the gateway and decides which durable transport backs it:

```ts
const gateway = web.server({
  namespace: "workspace:demo",
  transport: nats.kv(kv),
  authorize: (token) => token === expected,
})

await gateway.handle(request)
```

React stays ordinary: `useAtom(draft)` observes, `useFlow(saveDraft)` dispatches, and the sync transport is
chosen at the scope boundary. Tests prove browser-to-backend replication through fetch plus streamed
watch updates, namespace/auth enforcement, backend conflict pass-through, peer identity stability, and
rendered React behavior without module mocks.

## Run

```sh
pnpm test
pnpm typecheck
```
