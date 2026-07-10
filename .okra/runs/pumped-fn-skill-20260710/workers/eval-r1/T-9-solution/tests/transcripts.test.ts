import { createScope } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { attemptLedger, backfill, backoff, getTranscript, speechVendor } from "../src/transcripts.ts"

type Reply = { text: string } | { code: string }

function scriptedVendor(replies: Reply[], calls: string[]) {
  let index = 0
  return {
    transcribe: async ({ episodeId }: { episodeId: string }) => {
      calls.push(episodeId)
      const reply = replies[index++]
      if ("code" in reply) {
        const error = Object.assign(new Error(reply.code), { code: reply.code })
        throw error
      }
      return reply
    },
  }
}

describe("backfill", () => {
  it("retries busy responses through one staged invocation and stores the transcript", async () => {
    const calls: string[] = []
    const delays: number[] = []
    const ledger = attemptLedger()
    const scope = createScope({
      tags: [
        speechVendor(scriptedVendor([{ code: "vendor-busy" }, { code: "vendor-busy" }, { text: "hello" }], calls)),
        backoff(async (attempt) => { delays.push(attempt) }),
      ],
      extensions: [ledger.extension],
    })
    const session = scope.createContext()
    const run = session.exec({
      flow: backfill,
      input: { episodeIds: ["e1"], maxAttempts: 5 },
    })

    await expect(run).resolves.toEqual({ done: ["e1"], failed: [] })
    expect(calls).toEqual(["e1", "e1", "e1"])
    expect(delays).toEqual([1, 2])
    expect(ledger.counts()["speech.transcribe"]).toEqual({ started: 3, succeeded: 1, failed: 2 })
    await session.close({ ok: true })

    const reader = scope.createContext()
    await expect(reader.exec({ flow: getTranscript, input: { episodeId: "e1" } })).resolves.toEqual({ text: "hello" })
    await reader.close({ ok: true })
    await scope.dispose()
  })

  it("does not retry permanent vendor errors and continues with later episodes", async () => {
    const calls: string[] = []
    const scope = createScope({
      tags: [
        speechVendor(scriptedVendor([{ code: "invalid-audio" }, { text: "second" }], calls)),
        backoff(async (_attempt) => {}),
      ],
    })
    const session = scope.createContext()

    await expect(session.exec({
      flow: backfill,
      input: { episodeIds: ["bad", "good"], maxAttempts: 4 },
    })).resolves.toEqual({
      done: ["good"],
      failed: [{ episodeId: "bad", attempts: 1, code: "invalid-audio" }],
    })
    expect(calls).toEqual(["bad", "good"])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("records the final busy attempt when max attempts are exhausted", async () => {
    const calls: string[] = []
    const scope = createScope({
      tags: [
        speechVendor(scriptedVendor([{ code: "vendor-busy" }, { code: "vendor-busy" }], calls)),
        backoff(async (_attempt) => {}),
      ],
    })
    const session = scope.createContext()

    await expect(session.exec({
      flow: backfill,
      input: { episodeIds: ["e1"], maxAttempts: 2 },
    })).resolves.toEqual({
      done: [],
      failed: [{ episodeId: "e1", attempts: 2, code: "vendor-busy" }],
    })
    expect(calls).toEqual(["e1", "e1"])
    await session.close({ ok: true })
    await scope.dispose()
  })
})
