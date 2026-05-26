import {
  createAgentExtension,
  formatStepKey,
  type AgentEventLog,
  type AgentExtensionOptions,
  type AgentRemoteRunner,
  type AgentStepEntry,
  type AgentStepKey,
} from "@pumped-fn/agent-sdk"
import type { Lite } from "@pumped-fn/lite"

export class InMemoryAgentEventLog implements AgentEventLog {
  private readonly store = new Map<string, AgentStepEntry>()

  async get(key: AgentStepKey): Promise<AgentStepEntry | undefined> {
    return this.store.get(formatStepKey(key))
  }

  async putPending(entry: Extract<AgentStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<AgentStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async resolve(key: AgentStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatStepKey(key)}" not found`)
    this.store.set(formatStepKey(key), {
      status: "resolved",
      key,
      targetName: current.targetName,
      value,
    })
  }

  entries(): AgentStepEntry[] {
    return [...this.store.values()]
  }
}

export const localRemoteRunner: AgentRemoteRunner = {
  run: (_event, next) => next(),
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
