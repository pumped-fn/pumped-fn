import { extension, createScope, preset, type Extension } from "@pumped-fn/core-next"
import { transportExecutor } from "./transport"
import { stateAggregatorExecutor } from "./aggregator"
import { type Transport } from "./types"

export type DevtoolsConfig = {
  onMessage?: (msg: Transport.Message) => void
}

export const createDevtoolsExtension = (config?: DevtoolsConfig): Extension.Extension => {
  const handlers: Transport.Handler[] = []

  const transport: Transport.Transport = {
    emit: (msg) => handlers.forEach(h => h(msg)),
    subscribe: (handler) => {
      handlers.push(handler)
      return () => {
        const index = handlers.indexOf(handler)
        if (index > -1) handlers.splice(index, 1)
      }
    }
  }

  if (config?.onMessage) {
    transport.subscribe(config.onMessage)
  }

  let devtoolsScope: ReturnType<typeof createScope> | null = null

  return extension({
    name: "devtools",

    init: async (targetScope) => {
      devtoolsScope = createScope(preset(transportExecutor, transport))
      await devtoolsScope.resolve(transportExecutor)
      await devtoolsScope.resolve(stateAggregatorExecutor)
    },

    wrap: async (ctx, next, operation) => {
      const start = Date.now()
      const result = await next()
      const duration = Date.now() - start

      transport.emit({
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
      }
    }
  })
}
