import { createScope } from "@pumped-fn/lite"
import { attemptLedger, backfill, backoff, speechVendor } from "../src/transcripts.ts"

function cannedVendor() {
  const attempts = new Map<string, number>()
  return {
    async transcribe({ episodeId }: { episodeId: string }) {
      const count = (attempts.get(episodeId) ?? 0) + 1
      attempts.set(episodeId, count)
      if (count === 1) {
        const error = new Error("vendor is busy") as Error & { code: string }
        error.code = "vendor-busy"
        throw error
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

console.log(JSON.stringify(result))
console.log(JSON.stringify(ledger.counts()))

await session.close({ ok: true })
await scope.dispose()
