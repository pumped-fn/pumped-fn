import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createIPCTransport } from "../src/transports/ipc"
import { type Transport, type IPCTransport } from "../src/types"
import * as net from "node:net"
import * as fs from "node:fs"

describe("IPC Transport", () => {
  let server: net.Server
  const socketPath = "/tmp/test-pumped-fn.sock"
  const connections: net.Socket[] = []

  beforeEach(async () => {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath)
    }
    server = net.createServer((socket) => {
      connections.push(socket)
    })
    await new Promise<void>((resolve) => {
      server.listen(socketPath, resolve)
    })
  })

  afterEach(async () => {
    connections.forEach(c => c.destroy())
    connections.length = 0
    await new Promise<void>((resolve) => {
      server.close(() => {
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath)
        }
        resolve()
      })
    })
  })

  it("should create IPC transport", () => {
    const transport = createIPCTransport({ socketPath })

    expect(transport).toHaveProperty("emit")
    expect(transport).toHaveProperty("subscribe")
  })

  it("should connect and send handshake", async () => {
    let receivedHandshake: IPCTransport.Handshake | null = null

    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        const line = data.toString().trim()
        if (line.startsWith("HANDSHAKE:")) {
          receivedHandshake = JSON.parse(line.slice(10))
        }
      })
    })

    const transport = createIPCTransport({
      socketPath,
      scopeName: "test-scope"
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(receivedHandshake).not.toBeNull()
    expect(receivedHandshake?.name).toBe("test-scope")
    expect(receivedHandshake?.pid).toBe(process.pid)
  })

  it("should emit messages to socket", async () => {
    const receivedMessages: Transport.Message[] = []

    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        const lines = data.toString().trim().split("\n")
        for (const line of lines) {
          if (line.startsWith("MESSAGE:")) {
            receivedMessages.push(JSON.parse(line.slice(8)))
          }
        }
      })
    })

    const transport = createIPCTransport({ socketPath })

    await new Promise(resolve => setTimeout(resolve, 100))

    const testMsg: Transport.Message = {
      timestamp: Date.now(),
      duration: 10,
      operation: { kind: "resolve", executorId: "test" }
    }

    transport.emit(testMsg)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(receivedMessages).toHaveLength(1)
    expect(receivedMessages[0]).toEqual(testMsg)
  })
})
