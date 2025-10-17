import * as net from "node:net"
import * as fs from "node:fs"

export type ServerConfig = {
  socketPath?: string
}

const DEFAULT_SOCKET_PATH = `/tmp/pumped-fn-devtools-${process.env.USER || "default"}.sock`

export const createIPCServer = (config: ServerConfig = {}) => {
  const socketPath = config.socketPath ?? DEFAULT_SOCKET_PATH
  const server = net.createServer()

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
