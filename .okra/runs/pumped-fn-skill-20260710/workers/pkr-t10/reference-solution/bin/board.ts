import { createScope } from "@pumped-fn/lite"
import { renderDepartures } from "../src/board.ts"

const scope = createScope()
const ctx = scope.createContext()
const result = await ctx.exec({
  flow: renderDepartures,
  input: {
    departures: [
      { vessel: "MV Selkie", at: "08:15" },
      { vessel: "MV Kittiwake", at: "09:40" },
    ],
  },
})
console.log(JSON.stringify(result))
await ctx.close()
await scope.dispose()
