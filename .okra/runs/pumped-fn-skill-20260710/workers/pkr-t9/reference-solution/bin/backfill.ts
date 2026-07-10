import { createScope } from "@pumped-fn/lite"
import type { SpeechVendor } from "../src/transcripts.ts"
import { attemptLedger, backfill, backoff, speechVendor } from "../src/transcripts.ts"

const flakyVendor = (): SpeechVendor => {
  const busyBudget = new Map<string, number>()
  return {
    transcribe: (request) => {
      const remaining = busyBudget.get(request.episodeId) ?? 1
      if (remaining > 0) {
        busyBudget.set(request.episodeId, remaining - 1)
        return Promise.reject(Object.assign(new Error("vendor busy"), { code: "vendor-busy" }))
      }
      return Promise.resolve({ text: `Transcript of ${request.episodeId}: welcome back to the show.` })
    },
  }
}

const wait = () => Promise.resolve()

const ledger = attemptLedger()
const scope = createScope({
  tags: [speechVendor(flakyVendor()), backoff(wait)],
  extensions: [ledger.extension],
})
const ctx = scope.createContext()
const result = await ctx.exec({ flow: backfill, input: { episodeIds: ["ep-101", "ep-102"], maxAttempts: 4 } })
await ctx.close()
await scope.dispose()
console.log(JSON.stringify({ result, ledger: ledger.counts() }, null, 2))
