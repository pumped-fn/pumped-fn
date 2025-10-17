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

  it("should receive and parse handshake from client", async () => {
    let receivedHandshake: any = null

    server = createIPCServer({
      socketPath,
      onHandshake: (socket, handshake) => {
        receivedHandshake = handshake
      }
    })
    await server.listen()

    const client = net.createConnection(socketPath)

    client.on("connect", () => {
      const handshake = {
        scopeId: "test-123",
        name: "test-scope",
        pid: process.pid,
        timestamp: Date.now()
      }
      client.write(`HANDSHAKE:${JSON.stringify(handshake)}\n`)
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(receivedHandshake).not.toBeNull()
    expect(receivedHandshake?.scopeId).toBe("test-123")
    expect(receivedHandshake?.name).toBe("test-scope")

    client.end()
  })

  it("should receive and parse messages from client", async () => {
    const receivedMessages: any[] = []

    server = createIPCServer({
      socketPath,
      onMessage: (socket, msg) => {
        receivedMessages.push(msg)
      }
    })
    await server.listen()

    const client = net.createConnection(socketPath)

    client.on("connect", () => {
      const msg = {
        timestamp: Date.now(),
        duration: 10,
        operation: { kind: "resolve", executorId: "test" }
      }
      client.write(`MESSAGE:${JSON.stringify(msg)}\n`)
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(receivedMessages).toHaveLength(1)
    expect(receivedMessages[0].operation.executorId).toBe("test")

    client.end()
  })
})
