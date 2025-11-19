import { provide, name, type Core } from "@pumped-fn/core-next"
import { createTransport } from "./transports/in-memory"
import { type Transport } from "./types"

export const transportExecutor: Core.Executor<Transport.Transport> = provide(() => {
  return createTransport()
}, name("transport"))
