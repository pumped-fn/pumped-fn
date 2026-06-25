import { type Lite } from "@pumped-fn/lite"
import {
  eventLog,
  extension,
  formatStepKey,
  remoteRunner,
  runDefaults,
  workflowExtension,
  type ExtensionOptions,
  type RemoteRunner,
  type RunLog,
  type RunQuery,
  type WorkflowExtensionOptions,
  type WorkflowStepEntry,
  type WorkflowStepKey,
} from "@pumped-fn/agent-sdk"

export class MemoryLog implements RunLog {
  private readonly store = new Map<string, WorkflowStepEntry>()

  async get(key: WorkflowStepKey): Promise<WorkflowStepEntry | undefined> {
    return this.store.get(formatStepKey(key))
  }

  async putPending(entry: Extract<WorkflowStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<WorkflowStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async putFailed(entry: Extract<WorkflowStepEntry, { status: "failed" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async resolve(key: WorkflowStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatStepKey(key)}" not found`)
    this.store.set(formatStepKey(key), {
      status: "resolved",
      key,
      targetName: current.targetName,
      value,
    })
  }

  async list(query: Partial<RunQuery> = {}): Promise<readonly WorkflowStepEntry[]> {
    return [...this.store.values()].filter((entry) =>
      (query.taskId === undefined || entry.key.taskId === query.taskId) &&
      (query.runId === undefined || entry.key.runId === query.runId)
    )
  }
}

const local: RemoteRunner = {
  run: (_event, next) => next(),
}

export function memory(
  options: ExtensionOptions & Omit<WorkflowExtensionOptions, "log"> & { log?: RunLog } = {}
): { extensions: Lite.Extension[]; tags: Lite.Tagged<any>[]; log: RunLog } {
  const log = options.log ?? new MemoryLog()
  return {
    log,
    tags: [
      eventLog(log),
      remoteRunner(options.remoteRunner ?? local),
      runDefaults({
        defaultTaskId: options.defaultTaskId ?? "default-task",
        defaultRunId: options.defaultRunId ?? "default-run",
      }),
    ],
    extensions: [
      workflowExtension({
        observe: options.observe,
        units: options.units,
      }),
      extension(),
    ],
  }
}
