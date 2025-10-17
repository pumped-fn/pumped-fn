import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createIPCServer } from "../src/server"
import * as net from "node:net"

describe("IPC Server", () => {
  const socketPath = "/tmp/test-server.sock"
  let server: ReturnType<typeof createIPCServer>

  afterEach(async () => {
    if (server) {
      await server.close()
    }
  })

  it("should create and listen on socket", async () => {
    server = createIPCServer({ socketPath })
    await server.listen()

    const client = net.createConnection(socketPath)

    await new Promise<void>((resolve) => {
      client.on("connect", () => {
        client.end()
        resolve()
      })
    })
  })
})
