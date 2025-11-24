import { beforeEach, afterEach } from "vitest"

let unhandledRejections: Array<{ reason: unknown; promise: Promise<unknown> }> = []
let unhandledRejectionHandler: (reason: unknown, promise: Promise<unknown>) => void

beforeEach(() => {
  unhandledRejections = []
  unhandledRejectionHandler = (reason, promise) => {
    unhandledRejections.push({ reason, promise })
  }
  process.on("unhandledRejection", unhandledRejectionHandler)
})

afterEach(() => {
  process.removeListener("unhandledRejection", unhandledRejectionHandler)

  if (unhandledRejections.length > 0) {
    const messages = unhandledRejections.map(({ reason }) => {
      if (reason instanceof Error) {
        return reason.message
      }
      return String(reason)
    })
    throw new Error(
      `Test completed with ${unhandledRejections.length} unhandled rejection(s):\n  - ${messages.join("\n  - ")}`
    )
  }
})
