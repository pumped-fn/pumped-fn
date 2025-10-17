#!/usr/bin/env node

import { createIPCServer } from "../server"
import { createMultiScopeAggregator } from "../multi-scope-aggregator"

const args = process.argv.slice(2)
let socketPath: string | undefined

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--socket" && args[i + 1]) {
    socketPath = args[i + 1]
    i++
  }
}

const main = async () => {
  console.log("Pumped-FN Devtools CLI")

  const aggregator = createMultiScopeAggregator()
  const clientScopes = new Map<any, string>()

  const server = createIPCServer({
    socketPath,
    onHandshake: (socket, handshake) => {
      console.log(`Scope connected: ${handshake.name || handshake.scopeId} (pid: ${handshake.pid})`)
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
  console.log(`Listening on ${socketPath || "default socket"}`)

  process.on("SIGINT", async () => {
    console.log("\nShutting down...")
    await server.close()
    process.exit(0)
  })
}

main().catch(console.error)
