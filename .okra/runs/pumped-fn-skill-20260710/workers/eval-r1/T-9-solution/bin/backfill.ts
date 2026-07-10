import { createScope } from "@pumped-fn/lite"
import { attemptLedger, backfill, backoff, speechVendor } from "../src/transcripts.ts"

function cannedVendor() {
  const attempted = new Set<string>()
  return {
    transcribe: async ({ episodeId }: { episodeId: string }) => {
      if (!attempted.has(episodeId)) {
        attempted.add(episodeId)
        throw Object.assign(new Error("vendor-busy"), { code: "vendor-busy" })
      }
      return { text: `Transcript for ${episodeId}` }
    },
  }
}

const ledger = attemptLedger()
const scope = createScope({
  tags: [speechVendor(cannedVendor()), backoff(async (_attempt) => {})],
  extensions: [ledger.extension],
})
const session = scope.createContext()
const result = await session.exec({
  flow: backfill,
  input: { episodeIds: ["episode-1", "episode-2"], maxAttempts: 3 },
})

console.log(JSON.stringify({ result, ledger: ledger.counts() }))
await session.close({ ok: true })
await scope.dispose()
