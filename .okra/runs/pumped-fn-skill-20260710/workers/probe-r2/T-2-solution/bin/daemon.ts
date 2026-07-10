import { createScope } from "@pumped-fn/lite"
import { listHolds, printerReport, recordReturn, recordReturns, requestStop, runDispatcher } from "../src/holdshelf.js"

const scope = createScope()
const daemon = scope.createContext()
let stopping = false

async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  await daemon.exec({ flow: requestStop })
}

process.on("SIGINT", () => { void stop() })

const dispatcher = daemon.exec({ flow: runDispatcher })
await daemon.exec({ flow: recordReturn, input: { isbn: "9780140328721", copyId: "copy-1" } })
await daemon.exec({
  flow: recordReturns,
  input: {
    returns: [
      { isbn: "9780439708180", copyId: "copy-2" },
      { isbn: "9780547928227", copyId: "copy-3" },
    ],
  },
})
await stop()
await dispatcher
console.log(JSON.stringify({ holds: await daemon.exec({ flow: listHolds }), printer: await daemon.exec({ flow: printerReport }) }))
await daemon.close({ ok: true })
await scope.dispose()
