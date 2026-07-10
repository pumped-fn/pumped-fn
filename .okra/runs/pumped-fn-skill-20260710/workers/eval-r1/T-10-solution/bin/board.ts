import { createScope } from "@pumped-fn/lite"
import { renderDepartures } from "../src/board.js"

const scope = createScope()
const ctx = scope.createContext()

await ctx.exec({
  flow: renderDepartures,
  input: {
    departures: [
      { vessel: "North Star", at: "09:15" },
      { vessel: "Harbor Runner", at: "09:40" },
    ],
  },
})
await ctx.close({ ok: true })
await scope.dispose()
