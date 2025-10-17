import { extension, createScope, type Extension } from "@pumped-fn/core-next"
import { transportExecutor } from "./transport"
import { type Transport } from "./types"

export type DevtoolsConfig = {
  onMessage?: (msg: Transport.Message) => void
}

export const createDevtoolsExtension = (config?: DevtoolsConfig): Extension.Extension => {
  let devtoolsScope: ReturnType<typeof createScope> | null = null
  let transport: Transport.Transport | null = null

  const ensureTransport = async () => {
    if (!transport) {
      devtoolsScope = createScope()
      transport = await devtoolsScope.resolve(transportExecutor)

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
