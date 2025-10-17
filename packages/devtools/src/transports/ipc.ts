import { type Transport, type IPCTransport } from "../types"

const DEFAULT_SOCKET_PATH = `/tmp/pumped-fn-devtools-${process.env.USER || "default"}.sock`

export const createIPCTransport = (
  config: IPCTransport.Config = {}
): Transport.Transport => {
  const socketPath = config.socketPath ?? DEFAULT_SOCKET_PATH

  return {
    emit: (msg: Transport.Message) => {
    },
    subscribe: (handler: Transport.Handler): Transport.Unsubscribe => {
      return () => {}
    }
  }
}
