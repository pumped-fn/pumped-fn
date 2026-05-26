import {
  extension as agentExtension,
  type AgentEventLog,
  type AgentExtensionOptions,
  type AgentRemoteRunner,
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

export class InMemorySuspenseEventLog implements SuspenseEventLog {
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

export class InMemoryAgentEventLog extends InMemorySuspenseEventLog implements AgentEventLog {}

export const localRemoteRunner: AgentRemoteRunner = {
  run: (_event, next) => next(),
}

export function suspense(
  options: Omit<SuspenseExtensionOptions, "log"> & { log?: SuspenseEventLog } = {}
): { extension: Lite.Extension; log: SuspenseEventLog } {
  const log = options.log ?? new InMemorySuspenseEventLog()
  return {
    log,
    extension: suspenseExtension({
      ...options,
      log,
    }),
  }
}

export function agent(
  options: Omit<AgentExtensionOptions, "log"> & { log?: AgentEventLog } = {}
): { extension: Lite.Extension; log: AgentEventLog } {
  const log = options.log ?? new InMemoryAgentEventLog()
  return {
    log,
    extension: agentExtension({
      ...options,
      log,
      remoteRunner: options.remoteRunner ?? localRemoteRunner,
    }),
  }
}
