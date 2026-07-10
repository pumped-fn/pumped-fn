import { createScope } from "@pumped-fn/lite"
import { describe, expect, expectTypeOf, it } from "vitest"
import { attemptLedger, backfill, backoff, getTranscript, speechVendor } from "../src/transcripts.ts"

type Reply = { text: string } | { code: string }

function scriptedVendor(replies: Reply[]) {
  const calls: string[] = []
  return {
    calls,
    vendor: {
      async transcribe({ episodeId }: { episodeId: string }) {
        calls.push(episodeId)
        const reply = replies.shift()
        if (reply === undefined) throw new Error("script exhausted")
        if ("code" in reply) {
          const error = new Error(reply.code) as Error & { code: string }
          error.code = reply.code
          throw error
        }
        return reply
      },
    },
  }
}

describe("transcript backfill", () => {
  it("retries busy episodes from one staged invocation and persists their transcript", async () => {
    const scripted = scriptedVendor([{ code: "vendor-busy" }, { code: "vendor-busy" }, { text: "hello" }])
    const scope = createScope({
      tags: [speechVendor(scripted.vendor), backoff(async (_attempt) => {})],
    })
    const session = scope.createContext()
    const run = session.exec({
      flow: backfill,
      input: { episodeIds: ["e1"], maxAttempts: 5 },
    })
    expectTypeOf(run).toEqualTypeOf<Promise<{ done: string[]; failed: { episodeId: string; attempts: number; code: string }[] }>>()
    await expect(run).resolves.toEqual({ done: ["e1"], failed: [] })
    expect(scripted.calls).toEqual(["e1", "e1", "e1"])
    await session.close({ ok: true })

    const readSession = scope.createContext()
    await expect(readSession.exec({ flow: getTranscript, input: { episodeId: "e1" } })).resolves.toEqual({ text: "hello" })
    await readSession.close({ ok: true })
    await scope.dispose()
  })

  it("records a permanent vendor verdict without retrying", async () => {
    const scripted = scriptedVendor([{ code: "invalid-audio" }])
    const scope = createScope({
      tags: [speechVendor(scripted.vendor), backoff(async (_attempt) => {})],
    })
    const session = scope.createContext()
    await expect(session.exec({
      flow: backfill,
      input: { episodeIds: ["e1"], maxAttempts: 5 },
    })).resolves.toEqual({
      done: [],
      failed: [{ episodeId: "e1", attempts: 1, code: "invalid-audio" }],
    })
    expect(scripted.calls).toEqual(["e1"])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("fails after the configured number of busy attempts", async () => {
    const scripted = scriptedVendor([{ code: "vendor-busy" }, { code: "vendor-busy" }, { code: "vendor-busy" }])
    const scope = createScope({
      tags: [speechVendor(scripted.vendor), backoff(async (_attempt) => {})],
    })
    const session = scope.createContext()
    await expect(session.exec({
      flow: backfill,
      input: { episodeIds: ["e1"], maxAttempts: 3 },
    })).resolves.toEqual({
      done: [],
      failed: [{ episodeId: "e1", attempts: 3, code: "vendor-busy" }],
    })
    expect(scripted.calls).toEqual(["e1", "e1", "e1"])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("counts each vendor execution outcome", async () => {
    const scripted = scriptedVendor([{ code: "vendor-busy" }, { code: "vendor-busy" }, { text: "hello" }])
    const ledger = attemptLedger()
    const scope = createScope({
      tags: [speechVendor(scripted.vendor), backoff(async (_attempt) => {})],
      extensions: [ledger.extension],
    })
    const session = scope.createContext()
    await session.exec({ flow: backfill, input: { episodeIds: ["e1"], maxAttempts: 3 } })
    await session.close({ ok: true })
    expect(ledger.counts()["speech.transcribe"]).toEqual({ started: 3, succeeded: 1, failed: 2 })
    await scope.dispose()
  })
})
