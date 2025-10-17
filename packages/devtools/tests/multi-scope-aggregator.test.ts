import { describe, it, expect } from "vitest"
import { createMultiScopeAggregator } from "../src/multi-scope-aggregator"
import { type IPCTransport, type Transport } from "../src/types"

describe("Multi-Scope Aggregator", () => {
  it("should track multiple scopes", () => {
    const aggregator = createMultiScopeAggregator()

    const handshake1: IPCTransport.Handshake = {
      scopeId: "scope-1",
      name: "api",
      pid: 1000,
      timestamp: Date.now()
    }

    const handshake2: IPCTransport.Handshake = {
      scopeId: "scope-2",
      name: "worker",
      pid: 1001,
      timestamp: Date.now()
    }

    aggregator.registerScope(handshake1)
    aggregator.registerScope(handshake2)

    const scopes = aggregator.getScopes()
    expect(scopes).toHaveLength(2)
    expect(scopes[0].id).toBe("scope-1")
    expect(scopes[1].id).toBe("scope-2")
  })

  it("should route messages to scope-specific aggregators", () => {
    const aggregator = createMultiScopeAggregator()

    const handshake: IPCTransport.Handshake = {
      scopeId: "scope-1",
      name: "api",
      pid: 1000,
      timestamp: Date.now()
    }

    aggregator.registerScope(handshake)

    const msg: Transport.Message = {
      timestamp: Date.now(),
      duration: 10,
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    }

    aggregator.handleMessage("scope-1", msg)

    const scopeState = aggregator.getScopeState("scope-1")
    expect(scopeState).toBeDefined()
    expect(scopeState?.executors.size).toBe(1)
  })
})
