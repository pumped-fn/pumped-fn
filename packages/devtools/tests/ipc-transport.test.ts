import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createIPCTransport } from "../src/transports/ipc"
import { type Transport } from "../src/types"
import * as net from "node:net"

describe("IPC Transport", () => {
  let server: net.Server
  const socketPath = "/tmp/test-pumped-fn.sock"

  beforeEach(async () => {
    server = net.createServer()
    await new Promise<void>((resolve) => {
      server.listen(socketPath, resolve)
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  it("should create IPC transport", () => {
    const transport = createIPCTransport({ socketPath })

    expect(transport).toHaveProperty("emit")
    expect(transport).toHaveProperty("subscribe")
  })
})
