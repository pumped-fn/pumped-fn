import { createScope } from "@pumped-fn/lite"
import { renderDepartures } from "../src/board.js"

const scope = createScope()
const ctx = scope.createContext()

await ctx.exec({
  flow: renderDepartures,
  input: {
    departures: [
      { vessel: "Island Star", at: "09:30" },
      { vessel: "Harbor Runner", at: "10:15" },
    ],
  },
})
await ctx.close({ ok: true })
await scope.dispose()
