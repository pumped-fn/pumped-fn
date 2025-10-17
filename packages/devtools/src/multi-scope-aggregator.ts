import { type IPCTransport } from "./types"

export type ScopeInfo = {
  id: string
  name?: string
  pid: number
  timestamp: number
  connected: boolean
}

export const createMultiScopeAggregator = () => {
  const scopes = new Map<string, ScopeInfo>()

  return {
    registerScope: (handshake: IPCTransport.Handshake) => {
      scopes.set(handshake.scopeId, {
        id: handshake.scopeId,
        name: handshake.name,
        pid: handshake.pid,
        timestamp: handshake.timestamp,
        connected: true
      })
    },
    getScopes: (): ScopeInfo[] => {
      return Array.from(scopes.values())
    }
  }
}
