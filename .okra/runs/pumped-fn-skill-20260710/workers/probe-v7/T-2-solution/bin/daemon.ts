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

const dispatching = daemon.exec({ flow: runDispatcher })

let stopped = false
async function shutdown(): Promise<void> {
  if (stopped) return
  stopped = true
  await daemon.exec({ flow: requestStop })
  await dispatching
}

async function report(): Promise<void> {
  const holds = await daemon.exec({ flow: listHolds })
  const sessions = await daemon.exec({ flow: printerReport })
  console.log(JSON.stringify({ holds, sessions }, null, 2))
}

process.on("SIGINT", () => {
  shutdown()
    .then(() => report())
    .then(async () => {
      await daemon.close({ ok: true })
      await scope.dispose()
      process.exit(0)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exit(1)
    })
})

await daemon.exec({ flow: recordReturn, input: { isbn: "9780134190440", copyId: "copy-1" } })
await daemon.exec({
  flow: recordReturns,
  input: {
    returns: [
      { isbn: "9780132350884", copyId: "copy-2" },
      { isbn: "9780201633610", copyId: "copy-3" },
    ],
  },
})

await shutdown()
await report()
await daemon.close({ ok: true })
await scope.dispose()
process.exit(0)
