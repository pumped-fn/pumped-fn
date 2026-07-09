# @pumped-fn/sdk-just-bash

> **Status: early.** Small surface, expect changes.

`just-bash` sandbox provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { sandbox } from "@pumped-fn/sdk-just-bash"

const scope = createScope({
  tags: [
    sandbox({
      options: {
        files: { "/workspace/README.md": "ship it" },
        cwd: "/workspace",
      },
    }),
  ],
})
```

`sandbox()` returns a lazy `agent.sandbox` tag. The `Bash` runtime is created only when a sandbox capability is first used, and the flow can be run with any other `sdk` sandbox tag instead.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
