import * as net from "node:net"
import * as fs from "node:fs"
import { type IPCTransport, type Transport } from "./types"

export type ServerConfig = {
  socketPath?: string
  onHandshake?: (socket: net.Socket, handshake: IPCTransport.Handshake) => void
  onMessage?: (socket: net.Socket, msg: Transport.Message) => void
}

const DEFAULT_SOCKET_PATH = `/tmp/pumped-fn-devtools-${process.env.USER || "default"}.sock`

export const createIPCServer = (config: ServerConfig = {}) => {
  const socketPath = config.socketPath ?? DEFAULT_SOCKET_PATH
  const server = net.createServer((socket) => {
    let buffer = ""

    socket.on("data", (data) => {
      buffer += data.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("HANDSHAKE:")) {
          const handshake = JSON.parse(line.slice(10)) as IPCTransport.Handshake
          config.onHandshake?.(socket, handshake)
        } else if (line.startsWith("MESSAGE:")) {
          const msg = JSON.parse(line.slice(8)) as Transport.Message
          config.onMessage?.(socket, msg)
        }
      }
    })
  })

  return {
    listen: async () => {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath)
      }

      return new Promise<void>((resolve) => {
        server.listen(socketPath, resolve)
      })
    },
    close: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath)
          }
          resolve()
        })
      })
    }
  }
}
