import { provide, name } from "@pumped-fn/core-next"
import { createTransport } from "./transports/in-memory"

export const transportExecutor = provide(() => {
  return createTransport()
}, name("transport"))
