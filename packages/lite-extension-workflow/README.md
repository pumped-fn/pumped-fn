# @pumped-fn/lite-extension-workflow

Workflow policy units for `@pumped-fn/lite` built on top of `@pumped-fn/lite-extension-suspense`.

## API

| Export | Purpose |
| --- | --- |
| `workflowExtension()` | Standard workflow extension with replay, durable suspend, timeout, active event, failure, and observation policy |
| `workflowExtensionUnits()` | The same workflow policy as reusable suspense units |
| `workflowRun()` | Context tag for `{ taskId, runId }` |
| `workflow` | Runtime tag available while the extension wraps execution |
| `step()` | Flow or exec tag for workflow, durable, remote, keyed, kinded, and timed steps |
| `abortSignal` | Runtime tag exposed to timed steps |
| `activeWorkflowEvent` | Runtime tag for the current workflow event |
| `eventLog()` | Scope/context tag for the durable workflow backend |
| `observer()` | Scope/context tag for lifecycle observation |
| `units()` | Scope/context tag for suspense units that prepend extension units |
| `runDefaults()` | Scope/context tag for default `{ taskId, runId }` values |

`workflowExtension()` reads its durable backend from `eventLog(log)` at the scope or context boundary. It requires `workflowRun()` on the context unless `runDefaults()` or explicit extension defaults are provided. Completed workflow steps replay from the log before dependencies or factory code run. Durable steps write pending entries and throw `SuspendSignal` until a resolver stores a value.

## Units

Use `workflowExtensionUnits()` when a runtime wants to compose the workflow policy through the lower suspense extension. Tag units are prepended to extension units, so use `units(workflowExtensionUnits())` with bare `suspenseExtension()` for the standalone composition path.

```ts
import { createScope, flow } from "@pumped-fn/lite"
import { extension as suspenseExtension } from "@pumped-fn/lite-extension-suspense"
import { eventLog, step, units, workflowExtensionUnits, workflowRun } from "@pumped-fn/lite-extension-workflow"

const worker = flow({
  name: "worker",
  tags: [step({ workflow: true, key: "worker" })],
  factory: () => "ok",
})

const scope = createScope({
  tags: [
    eventLog(log),
    units(workflowExtensionUnits()),
  ],
  extensions: [suspenseExtension({
    name: "workflow",
  })],
})

const ctx = scope.createContext({
  tags: [workflowRun({ taskId: "task-1", runId: "run-1" })],
})

await ctx.exec({ flow: worker })
```

The workflow package has no agent registry or worker implementation knowledge. Agent-specific remote execution lives in `@pumped-fn/agent-sdk`.
