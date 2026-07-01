# @pumped-fn/lite-extension-sync-nats

NATS JetStream KV transport for `@pumped-fn/lite-extension-sync`.

```ts
import { Kvm } from "@nats-io/kv"
import { connect } from "@nats-io/transport-node"
import { createScope } from "@pumped-fn/lite"
import { sync } from "@pumped-fn/lite-extension-sync"
import { nats } from "@pumped-fn/lite-extension-sync-nats"

const nc = await connect({ servers: "127.0.0.1:4222" })
const kv = await new Kvm(nc).create("drafts", { history: 5 })

const scope = createScope({
  extensions: [sync.extension()],
  tags: [
    sync.runtime({
      peer: "worker-1",
      transport: nats.kv(kv),
    }),
  ],
})
```

The adapter stores strict sync messages as UTF-8 JSON bytes in JetStream KV, uses watch updates for
live delivery, and returns the backend KV revision as the sync write acknowledgement.
Use `nats.kv(kv, { prefix, onError })` to customize the KV subject prefix or receive watch-loop
failures from the adapter boundary.
