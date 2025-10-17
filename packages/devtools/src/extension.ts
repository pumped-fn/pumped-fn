import { extension, createScope, type Extension } from "@pumped-fn/core-next"
import { transportExecutor } from "./transport"
import { createTransport } from "./transports/in-memory"
import { createIPCTransport } from "./transports/ipc"
import { type Transport, type IPCTransport } from "./types"

export type DevtoolsConfig = {
  transport?: "in-memory" | "ipc"
  transportConfig?: IPCTransport.Config
  scopeName?: string
  onMessage?: (msg: Transport.Message) => void
}

export const createDevtoolsExtension = (config?: DevtoolsConfig): Extension.Extension => {
  let devtoolsScope: ReturnType<typeof createScope> | null = null
  let transport: Transport.Transport | null = null

  const ensureTransport = async () => {
    if (!transport) {
      const transportType = config?.transport ?? "in-memory"

      if (transportType === "ipc") {
        transport = createIPCTransport({
          ...config?.transportConfig,
          scopeName: config?.scopeName
        })
      } else {
        devtoolsScope = createScope()
        transport = await devtoolsScope.resolve(transportExecutor)
      }

      if (config?.onMessage) {
        transport.subscribe(config.onMessage)
      }
    }
    return transport
  }

  return extension({
    name: "devtools",

    init: async (targetScope) => {
      await ensureTransport()
    },

    wrap: async (ctx, next, operation) => {
      const currentTransport = await ensureTransport()
      const start = Date.now()
      const result = await next()
      const duration = Date.now() - start

      currentTransport.emit({
        timestamp: Date.now(),
        duration,
        operation
      })

      return result
    },

    dispose: async () => {
      if (devtoolsScope) {
        await devtoolsScope.dispose()
        devtoolsScope = null
        transport = null
      }
    }
  })
}
