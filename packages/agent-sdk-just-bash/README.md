# @pumped-fn/agent-sdk-just-bash

`just-bash` sandbox provider for `@pumped-fn/agent-sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { sandbox } from "@pumped-fn/agent-sdk-just-bash"

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

`sandbox()` returns a lazy `agent.sandbox` tag. The `Bash` runtime is created only when a sandbox capability is first used, and the flow can be run with any other `agent-sdk` sandbox tag instead.
