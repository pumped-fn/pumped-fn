import {
  extension as agentExtension,
  workflowExtension,
  type AgentExtensionOptions,
  type AgentRemoteRunner,
  type WorkflowEventLog,
  type WorkflowExtensionOptions,
} from "@pumped-fn/agent-sdk"
import {
  extension as suspenseExtension,
  formatSuspenseStepKey,
  type SuspenseEventLog,
  type SuspenseExtensionOptions,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "@pumped-fn/lite-extension-suspense"
import type { Lite } from "@pumped-fn/lite"

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

  entries(): SuspenseStepEntry[] {
    return [...this.store.values()]
  }
}

export class MemoryWorkflowLog extends MemorySuspenseLog implements WorkflowEventLog {}

export const localRemoteRunner: AgentRemoteRunner = {
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

export function agent(
  options: AgentExtensionOptions & Omit<WorkflowExtensionOptions, "log"> & { log?: WorkflowEventLog } = {}
): { extensions: Lite.Extension[]; log: WorkflowEventLog } {
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
