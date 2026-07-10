import { createScope } from "@pumped-fn/lite"
import {
  listHolds,
  printerReport,
  recordReturn,
  recordReturns,
  requestStop,
  runDispatcher,
} from "../src/holdshelf.ts"

const scope = createScope()
const daemon = scope.createContext()
const dispatcher = daemon.exec({ flow: runDispatcher })
process.once("SIGINT", () => {
  void daemon.exec({ flow: requestStop })
})

await daemon.exec({ flow: recordReturn, input: { isbn: "9780140449136", copyId: "copy-1" } })
await daemon.exec({
  flow: recordReturns,
  input: {
    returns: [
      { isbn: "9780553213119", copyId: "copy-2" },
      { isbn: "9780679783268", copyId: "copy-3" },
    ],
  },
})
await daemon.exec({ flow: requestStop })
const outcome = await dispatcher

console.log(
  JSON.stringify(
    {
      dispatcher: outcome,
      holds: await daemon.exec({ flow: listHolds }),
      printer: await daemon.exec({ flow: printerReport }),
    },
    null,
    2,
  ),
)

await daemon.close()
await scope.dispose()
