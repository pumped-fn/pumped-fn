import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createScope } from "@pumped-fn/core-next"
import { createDevtoolsExtension } from "../src/extension"
import { createIPCServer } from "../src/server"
import { createMultiScopeAggregator } from "../src/multi-scope-aggregator"
import { provide } from "@pumped-fn/core-next"
import * as fs from "node:fs"

describe("Integration - IPC Transport", () => {
  const socketPath = "/tmp/test-integration.sock"
  let server: any
  let aggregator: any
  let clientScopes: Map<any, string>
  let connectedSockets: Set<any>

  beforeAll(async () => {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath)
    }

    aggregator = createMultiScopeAggregator()
    clientScopes = new Map()
    connectedSockets = new Set()

    server = createIPCServer({
      socketPath,
      onHandshake: (socket, handshake) => {
        connectedSockets.add(socket)
        aggregator.registerScope(handshake)
        clientScopes.set(socket, handshake.scopeId)
      },
      onMessage: (socket, msg) => {
        const scopeId = clientScopes.get(socket)
        if (scopeId) {
          aggregator.handleMessage(scopeId, msg)
        }
      }
    })

    await server.listen()
  })

  afterAll(async () => {
    for (const socket of connectedSockets) {
      socket.destroy()
    }
    if (server) {
      await server.close()
    }
  })

  it("should track operations from scope via IPC", async () => {
    const ext = createDevtoolsExtension({
      transport: "ipc",
      transportConfig: { socketPath },
      scopeName: "test-scope"
    })

    const testExecutor = provide(() => "test-value")
    const scope = createScope({ extensions: [ext] })

    await scope.resolve(testExecutor)

    await new Promise(resolve => setTimeout(resolve, 200))

    const scopes = aggregator.getScopes()
    expect(scopes.length).toBeGreaterThan(0)

    const testScopeInfo = scopes.find(s => s.name === "test-scope")
    expect(testScopeInfo).toBeDefined()

    const state = aggregator.getScopeState(testScopeInfo!.id)
    expect(state?.executors.size).toBeGreaterThan(0)

    await scope.dispose()
    await new Promise(resolve => setTimeout(resolve, 100))
  })
})
