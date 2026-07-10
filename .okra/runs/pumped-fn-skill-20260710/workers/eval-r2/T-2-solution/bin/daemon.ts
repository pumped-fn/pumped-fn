import { createScope } from "@pumped-fn/lite"
import { listHolds, printerReport, recordReturn, recordReturns, requestStop, runDispatcher } from "../src/holdshelf.js"

const scope = createScope()
const daemon = scope.createContext()
const dispatcher = daemon.exec({ flow: runDispatcher })

const stop = async () => {
  const ctx = scope.createContext()
  await ctx.exec({ flow: requestStop })
  await ctx.close({ ok: true })
}

process.once("SIGINT", () => { void stop() })

const first = scope.createContext()
await first.exec({ flow: recordReturn, input: { isbn: "9780000000001", copyId: "copy-1" } })
await first.exec({ flow: recordReturns, input: { returns: [
  { isbn: "9780000000002", copyId: "copy-2" },
  { isbn: "9780000000003", copyId: "copy-3" },
] } })
await first.close({ ok: true })

await stop()
await dispatcher

const report = scope.createContext()
console.log(JSON.stringify({
  holds: await report.exec({ flow: listHolds }),
  printer: await report.exec({ flow: printerReport }),
}))
await report.close({ ok: true })
await daemon.close({ ok: true })
await scope.dispose()
