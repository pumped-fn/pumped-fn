import { type Transport, type IPCTransport } from "../types"
import * as net from "node:net"

const DEFAULT_SOCKET_PATH = `/tmp/pumped-fn-devtools-${process.env.USER || "default"}.sock`

export const createIPCTransport = (
  config: IPCTransport.Config & { scopeName?: string } = {}
): Transport.Transport => {
  const socketPath = config.socketPath ?? DEFAULT_SOCKET_PATH
  const retryInterval = config.retryInterval ?? 5000
  const bufferSize = config.bufferSize ?? 100
  const bufferStrategy = config.bufferStrategy ?? "drop-old"

  let socket: net.Socket | null = null
  let connected = false
  let errorLogged = false
  let retryTimer: NodeJS.Timeout | null = null
  const messageBuffer: Transport.Message[] = []

  const connect = () => {
    try {
      socket = net.createConnection(socketPath)

      socket.on("connect", () => {
        connected = true
        errorLogged = false
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        const handshake: IPCTransport.Handshake = {
          scopeId: Math.random().toString(36).slice(2),
          name: config.scopeName,
          pid: process.pid,
          timestamp: Date.now()
        }
        socket?.write(`HANDSHAKE:${JSON.stringify(handshake)}\n`)

        while (messageBuffer.length > 0) {
          const msg = messageBuffer.shift()
          if (msg) {
            socket?.write(`MESSAGE:${JSON.stringify(msg)}\n`)
          }
        }
      })

      socket.on("error", (err) => {
        connected = false
        if (!errorLogged) {
          console.error(`Pumped-FN devtools connection failed: ${err.message}`)
          errorLogged = true
        }
        scheduleRetry()
      })

      socket.on("close", () => {
        connected = false
        scheduleRetry()
      })
    } catch (err) {
      if (!errorLogged && err instanceof Error) {
        console.error(`Pumped-FN devtools connection failed: ${err.message}`)
        errorLogged = true
      }
      scheduleRetry()
    }
  }

  const scheduleRetry = () => {
    if (!retryTimer && !connected) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        connect()
      }, retryInterval)
    }
  }

  connect()

  return {
    emit: (msg: Transport.Message) => {
      if (connected && socket) {
        socket.write(`MESSAGE:${JSON.stringify(msg)}\n`)
      } else {
        if (messageBuffer.length >= bufferSize) {
          if (bufferStrategy === "drop-old") {
            messageBuffer.shift()
          } else {
            return
          }
        }
        messageBuffer.push(msg)
      }
    },
    subscribe: (handler: Transport.Handler): Transport.Unsubscribe => {
      return () => {}
    }
  }
}
