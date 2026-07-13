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

`Sandbox.exec` accepts an optional `AbortSignal`. just-bash checks the signal at statement boundaries and stops a cancelled execution cooperatively:

```ts
import { createSandbox } from "@pumped-fn/sdk-just-bash"

const target = createSandbox()
const controller = new AbortController()
const execution = target.exec("bash", ["-c", "sleep 100; printf late"], { signal: controller.signal })
controller.abort()
const result = await execution
if (result.exitCode !== 124) throw new Error("execution was not cancelled")
```

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
