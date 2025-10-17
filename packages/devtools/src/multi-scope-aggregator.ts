import { type IPCTransport, type Transport, type State } from "./types"
import { createStateAggregator } from "./aggregator"

export type ScopeInfo = {
  id: string
  name?: string
  pid: number
  timestamp: number
  connected: boolean
}

export const createMultiScopeAggregator = () => {
  const scopes = new Map<string, ScopeInfo>()
  const aggregators = new Map<string, ReturnType<typeof createStateAggregator>>()

  return {
    registerScope: (handshake: IPCTransport.Handshake) => {
      scopes.set(handshake.scopeId, {
        id: handshake.scopeId,
        name: handshake.name,
        pid: handshake.pid,
        timestamp: handshake.timestamp,
        connected: true
      })

      if (!aggregators.has(handshake.scopeId)) {
        aggregators.set(handshake.scopeId, createStateAggregator())
      }
    },
    handleMessage: (scopeId: string, msg: Transport.Message) => {
      const aggregator = aggregators.get(scopeId)
      if (aggregator) {
        aggregator.process(msg)
      }
    },
    getScopeState: (scopeId: string): State.Snapshot | undefined => {
      const aggregator = aggregators.get(scopeId)
      return aggregator?.getSnapshot()
    },
    getScopes: (): ScopeInfo[] => {
      return Array.from(scopes.values())
    }
  }
}
