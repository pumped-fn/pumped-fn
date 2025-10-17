import { type Transport, type IPCTransport } from "../types"
import * as net from "node:net"

const DEFAULT_SOCKET_PATH = `/tmp/pumped-fn-devtools-${process.env.USER || "default"}.sock`

export const createIPCTransport = (
  config: IPCTransport.Config & { scopeName?: string } = {}
): Transport.Transport => {
  const socketPath = config.socketPath ?? DEFAULT_SOCKET_PATH
  let socket: net.Socket | null = null
  let connected = false

  const connect = () => {
    try {
      socket = net.createConnection(socketPath)

      socket.on("connect", () => {
        connected = true
        const handshake: IPCTransport.Handshake = {
          scopeId: Math.random().toString(36).slice(2),
          name: config.scopeName,
          pid: process.pid,
          timestamp: Date.now()
        }
        socket?.write(`HANDSHAKE:${JSON.stringify(handshake)}\n`)
      })

      socket.on("error", () => {
        connected = false
      })

      socket.on("close", () => {
        connected = false
      })
    } catch {}
  }

  connect()

  return {
    emit: (msg: Transport.Message) => {
      if (connected && socket) {
        socket.write(`MESSAGE:${JSON.stringify(msg)}\n`)
      }
    },
    subscribe: (handler: Transport.Handler): Transport.Unsubscribe => {
      return () => {}
    }
  }
}
