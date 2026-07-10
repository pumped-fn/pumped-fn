import { createScope } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import type { SpeechVendor } from "../src/transcripts.ts"
import { attemptLedger, backfill, backoff, getTranscript, speechVendor } from "../src/transcripts.ts"

type VendorReply = { busy: true } | { code: string } | { text: string }

const scripted = (scripts: Record<string, VendorReply[]>) => {
  const calls: { episodeId: string }[] = []
  const vendor: SpeechVendor = {
    transcribe: (request) => {
      calls.push({ ...request })
      const reply = scripts[request.episodeId]?.shift()
      if (!reply) return Promise.reject(Object.assign(new Error("unscripted"), { code: "unscripted" }))
      if ("busy" in reply) return Promise.reject(Object.assign(new Error("busy"), { code: "vendor-busy" }))
      if ("code" in reply) return Promise.reject(Object.assign(new Error(reply.code), { code: reply.code }))
      return Promise.resolve({ text: reply.text })
    },
  }
  return { vendor, calls }
}

const instantBackoff = () => {
  const waits: number[] = []
  const wait = (attempt: number) => {
    waits.push(attempt)
    return Promise.resolve()
  }
  return { wait, waits }
}

const session = async <T>(
  scripts: Record<string, VendorReply[]>,
  run: (exec: <O>(options: { flow: { name?: string }; input: unknown }) => Promise<O>, seams: {
    calls: { episodeId: string }[]
    waits: number[]
    counts: () => Record<string, { started: number; succeeded: number; failed: number }>
  }) => Promise<T>,
) => {
  const { vendor, calls } = scripted(scripts)
  const { wait, waits } = instantBackoff()
  const ledger = attemptLedger()
  const scope = createScope({
    tags: [speechVendor(vendor), backoff(wait)],
    extensions: [ledger.extension],
  })
  const ctx = scope.createContext()
  try {
    return await run((options) => ctx.exec(options as never) as never, { calls, waits, counts: ledger.counts })
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}

describe("backfill", () => {
  test("busy, busy, ok succeeds in 3 vendor calls with 2 backoffs", async () => {
    await session({ e1: [{ busy: true }, { busy: true }, { text: "hello archive" }] }, async (exec, seams) => {
      const result = await exec({ flow: backfill, input: { episodeIds: ["e1"], maxAttempts: 5 } })
      expect(result).toEqual({ done: ["e1"], failed: [] })
      expect(seams.calls).toEqual([{ episodeId: "e1" }, { episodeId: "e1" }, { episodeId: "e1" }])
      expect(seams.waits).toEqual([1, 2])
      expect(await exec({ flow: getTranscript, input: { episodeId: "e1" } })).toEqual({ text: "hello archive" })
    })
  })

  test("non-busy error class fails immediately with a single vendor call", async () => {
    await session({ e2: [{ code: "invalid-audio" }, { text: "never reached" }] }, async (exec, seams) => {
      const result = await exec({ flow: backfill, input: { episodeIds: ["e2"], maxAttempts: 5 } })
      expect(result).toEqual({ done: [], failed: [{ episodeId: "e2", attempts: 1, code: "invalid-audio" }] })
      expect(seams.calls).toHaveLength(1)
      expect(seams.waits).toEqual([])
      expect(await exec({ flow: getTranscript, input: { episodeId: "e2" } })).toBeNull()
    })
  })

  test("maxAttempts exhaustion records the attempt count", async () => {
    await session({ e3: [{ busy: true }, { busy: true }, { busy: true }, { busy: true }] }, async (exec, seams) => {
      const result = await exec({ flow: backfill, input: { episodeIds: ["e3"], maxAttempts: 3 } })
      expect(result).toEqual({ done: [], failed: [{ episodeId: "e3", attempts: 3, code: "vendor-busy" }] })
      expect(seams.calls).toHaveLength(3)
      expect(seams.waits).toEqual([1, 2])
    })
  })

  test("ledger counts match the scripted scenario per operation name", async () => {
    await session({ e1: [{ busy: true }, { busy: true }, { text: "ledger check" }] }, async (exec, seams) => {
      await exec({ flow: backfill, input: { episodeIds: ["e1"], maxAttempts: 5 } })
      expect(seams.counts()["speech.transcribe"]).toEqual({ started: 3, succeeded: 1, failed: 2 })
      expect(seams.counts()["transcribe-episode"]).toEqual({ started: 3, succeeded: 1, failed: 2 })
    })
  })

  test("a permanent failure does not stop the rest of the batch", async () => {
    await session(
      { good: [{ text: "kept" }], bad: [{ code: "invalid-audio" }] },
      async (exec, seams) => {
        const result = await exec({ flow: backfill, input: { episodeIds: ["bad", "good"], maxAttempts: 4 } })
        expect(result).toEqual({
          done: ["good"],
          failed: [{ episodeId: "bad", attempts: 1, code: "invalid-audio" }],
        })
        expect(seams.calls).toEqual([{ episodeId: "bad" }, { episodeId: "good" }])
      },
    )
  })
})
