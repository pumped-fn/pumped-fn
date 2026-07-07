import {
  extension as agentExtension,
  workflowExtension,
  type ExtensionOptions,
  type Model,
  type ModelRequest,
  type ModelResponse,
  type RemoteRunner,
  type RunLog,
  type RunQuery,
  type WorkflowEventLog,
  type WorkflowExtensionOptions,
} from "@pumped-fn/sdk"
import {
  extension as suspenseExtension,
  formatSuspenseStepKey,
  type SuspenseEventLog,
  type SuspenseExtensionOptions,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "@pumped-fn/lite-extension-suspense"
import { flow, typed, type Lite } from "@pumped-fn/lite"

type MaybePromise<T> = T | Promise<T>

export function modelStub(respond: (request: ModelRequest) => MaybePromise<ModelResponse>): Model {
  return flow({ name: "model.stub", parse: typed<ModelRequest>(), factory: (ctx) => respond(ctx.input) })
}

export class MemorySuspenseLog implements SuspenseEventLog {
  private readonly store = new Map<string, SuspenseStepEntry>()

  async get(key: SuspenseStepKey): Promise<SuspenseStepEntry | undefined> {
    return this.store.get(formatSuspenseStepKey(key))
  }

  async putPending(entry: Extract<SuspenseStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatSuspenseStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<SuspenseStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatSuspenseStepKey(entry.key), entry)
  }

  async resolve(key: SuspenseStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatSuspenseStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatSuspenseStepKey(key)}" not found`)
    this.store.set(formatSuspenseStepKey(key), {
      status: "resolved",
      key,
      targetName: current.targetName,
      value,
    })
  }

  entries(query: Partial<RunQuery> = {}): SuspenseStepEntry[] {
    return [...this.store.values()].filter((entry) =>
      (query.taskId === undefined || entry.key.taskId === query.taskId) &&
      (query.runId === undefined || entry.key.runId === query.runId)
    )
  }
}

export class MemoryWorkflowLog extends MemorySuspenseLog implements WorkflowEventLog, RunLog {}

export const localRemoteRunner: RemoteRunner = {
  run: (_event, next) => next(),
}

export function suspense(
  options: Omit<SuspenseExtensionOptions, "log"> & { log?: SuspenseEventLog } = {}
): { extension: Lite.Extension; log: SuspenseEventLog } {
  const log = options.log ?? new MemorySuspenseLog()
  return {
    log,
    extension: suspenseExtension({
      ...options,
      log,
    }),
  }
}

export function kit(
  options: ExtensionOptions & Omit<WorkflowExtensionOptions, "log"> & { log?: RunLog } = {}
): { extensions: Lite.Extension[]; log: RunLog } {
  const log = options.log ?? new MemoryWorkflowLog()
  return {
    log,
    extensions: [
      workflowExtension({
        log,
        defaultTaskId: options.defaultTaskId,
        defaultRunId: options.defaultRunId,
      }),
      agentExtension({
        remoteRunner: options.remoteRunner ?? localRemoteRunner,
      }),
    ],
  }
}
