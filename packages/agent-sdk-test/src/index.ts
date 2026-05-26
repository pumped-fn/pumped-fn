import {
  createAgentExtension,
  createSuspenseExtension,
  formatStepKey,
  type AgentEventLog,
  type AgentExtensionOptions,
  type AgentRemoteRunner,
  type AgentStepEntry,
  type AgentStepKey,
  type SuspenseEventLog,
  type SuspenseExtensionOptions,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "@pumped-fn/agent-sdk"
import type { Lite } from "@pumped-fn/lite"

export class InMemorySuspenseEventLog implements SuspenseEventLog {
  private readonly store = new Map<string, SuspenseStepEntry>()

  async get(key: SuspenseStepKey): Promise<SuspenseStepEntry | undefined> {
    return this.store.get(formatStepKey(key))
  }

  async putPending(entry: Extract<SuspenseStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<SuspenseStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async resolve(key: SuspenseStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatStepKey(key)}" not found`)
    this.store.set(formatStepKey(key), {
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

export function createSuspenseTestExtension(
  options: Omit<SuspenseExtensionOptions, "log"> & { log?: SuspenseEventLog } = {}
): { extension: Lite.Extension; log: SuspenseEventLog } {
  const log = options.log ?? new InMemorySuspenseEventLog()
  return {
    log,
    extension: createSuspenseExtension({
      ...options,
      log,
    }),
  }
}

export function createAgentTestExtension(
  options: Omit<AgentExtensionOptions, "log"> & { log?: AgentEventLog } = {}
): { extension: Lite.Extension; log: AgentEventLog } {
  const log = options.log ?? new InMemoryAgentEventLog()
  return {
    log,
    extension: createAgentExtension({
      ...options,
      log,
      remoteRunner: options.remoteRunner ?? localRemoteRunner,
    }),
  }
}
