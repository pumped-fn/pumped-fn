import { createScope } from "@pumped-fn/lite"
import {
  listHolds,
  printerReport,
  recordReturn,
  recordReturns,
  requestStop,
  runDispatcher,
} from "../src/holdshelf.js"

const scope = createScope()
const daemon = scope.createContext()
const dispatcher = daemon.exec({ flow: runDispatcher })

let stopping = false
const stop = async (): Promise<void> => {
  if (stopping) return
  stopping = true
  await daemon.exec({ flow: requestStop })
}

process.once("SIGINT", () => { void stop() })

try {
  await daemon.exec({ flow: recordReturn, input: { isbn: "9780140328721", copyId: "copy-1" } })
  await daemon.exec({
    flow: recordReturns,
    input: {
      returns: [
        { isbn: "9780061120084", copyId: "copy-2" },
        { isbn: "9780439139601", copyId: "copy-3" },
      ],
    },
  })
  await stop()
  await dispatcher
  console.log(JSON.stringify({
    holds: await daemon.exec({ flow: listHolds }),
    printer: await daemon.exec({ flow: printerReport }),
  }))
  await daemon.close({ ok: true })
  await scope.dispose()
} catch (error) {
  await daemon.close({ ok: false, error })
  await scope.dispose()
  throw error
}
