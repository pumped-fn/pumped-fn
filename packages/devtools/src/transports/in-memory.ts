import { type Transport } from "../types"

export const createTransport = (): Transport.Transport => {
  const handlers: Transport.Handler[] = []

  return {
    emit: (msg: Transport.Message) => {
      handlers.forEach(h => {
        try {
          h(msg)
        } catch {}
      })
    },
    subscribe: (handler: Transport.Handler): Transport.Unsubscribe => {
      handlers.push(handler)
      return () => {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }
  }
}
