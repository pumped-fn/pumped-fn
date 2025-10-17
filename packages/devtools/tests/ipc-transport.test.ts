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
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    }

    transport.emit(testMsg)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(receivedMessages).toHaveLength(1)
    expect(receivedMessages[0]).toEqual(testMsg)
  })

  it("should degrade silently when server unavailable", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const transport = createIPCTransport({
      socketPath: "/tmp/nonexistent-socket.sock"
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    transport.emit({
      timestamp: Date.now(),
      duration: 10,
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    })

    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThan(0)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pumped-FN devtools connection failed")
    )

    consoleErrorSpy.mockRestore()
  })

  it("should retry connection with configurable interval", async () => {
    const receivedHandshakes: IPCTransport.Handshake[] = []

    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        const line = data.toString().trim()
        if (line.startsWith("HANDSHAKE:")) {
          receivedHandshakes.push(JSON.parse(line.slice(10)))
        }
      })
    })

    const transport = createIPCTransport({
      socketPath,
      retryInterval: 100
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    connections[0]?.destroy()

    await new Promise(resolve => setTimeout(resolve, 200))

    expect(receivedHandshakes.length).toBeGreaterThan(1)
  })

  it("should buffer messages while disconnected", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath)
        }
        resolve()
      })
    })

    const transport = createIPCTransport({
      socketPath,
      bufferSize: 5,
      retryInterval: 100
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    transport.emit({ timestamp: 1, duration: 1, operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const } })
    transport.emit({ timestamp: 2, duration: 1, operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const } })

    const receivedMessages: Transport.Message[] = []

    server = net.createServer((socket) => {
      connections.push(socket)
      socket.on("data", (data) => {
        const lines = data.toString().trim().split("\n")
        for (const line of lines) {
          if (line.startsWith("MESSAGE:")) {
            receivedMessages.push(JSON.parse(line.slice(8)))
          }
        }
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(socketPath, resolve)
    })

    await new Promise(resolve => setTimeout(resolve, 200))

    expect(receivedMessages).toHaveLength(2)
  })
})
