import type { Lite } from "@pumped-fn/lite"
import { atom, controller, flow, isFault, tag, tags, typed } from "@pumped-fn/lite"

export type SpeechVendor = {
  transcribe: (request: { episodeId: string }) => Promise<{ text: string }>
}

export type EpisodeFailure = { episodeId: string; attempts: number; code: string }
export type AttemptCounts = { started: number; succeeded: number; failed: number }

export const speechVendor = tag<SpeechVendor>({ label: "speech.vendor" })
export const backoff = tag<(attempt: number) => Promise<void>>({ label: "retry.backoff" })

const transcriptStore = atom({
  factory: () => new Map<string, string>(),
})

type TranscribeFault = { code: string; episodeId: string }

const scriptedOutcome = (attempt: number) => (attempt < 3 ? "vendor-busy" : "ok")

export const transcribeEpisode = flow({
  name: "transcribe-episode",
  parse: typed<{ episodeId: string; attempt: number }>(),
  faults: typed<TranscribeFault>(),
  deps: { store: transcriptStore },
  factory: async (ctx, { store }) => {
    const { episodeId, attempt } = ctx.input
    const outcome = await ctx.exec({
      fn: () => Promise.resolve(scriptedOutcome(attempt)),
      params: [],
      name: "speech.transcribe",
    })
    if (outcome === "vendor-busy") return ctx.fail({ code: "vendor-busy", episodeId })
    const text = `transcript of ${episodeId}`
    store.set(episodeId, text)
    return { episodeId, chars: text.length }
  },
})

export const getTranscript = flow({
  name: "get-transcript",
  parse: typed<{ episodeId: string }>(),
  deps: { store: transcriptStore },
  factory: (ctx, { store }) => {
    const text = store.get(ctx.input.episodeId)
    return text === undefined ? null : { text }
  },
})

export const backfill = flow({
  name: "backfill",
  parse: typed<{ episodeIds: string[]; maxAttempts: number }>(),
  deps: { transcribe: controller(transcribeEpisode), wait: tags.required(backoff) },
  factory: async (ctx, { transcribe, wait }) => {
    const done: string[] = []
    const failed: EpisodeFailure[] = []
    for (const episodeId of ctx.input.episodeIds) {
      let attempts = 0
      let settled = false
      while (!settled) {
        attempts += 1
        const step = transcribe.prepare({ input: { episodeId, attempt: attempts } })
        try {
          await step.exec()
          done.push(episodeId)
          settled = true
        } catch (error) {
          if (!isFault(transcribeEpisode, error)) throw error
          if (attempts >= ctx.input.maxAttempts) {
            failed.push({ episodeId, attempts, code: error.fault.code })
            settled = true
          } else {
            await ctx.exec({ fn: () => wait(attempts), params: [], name: "retry.backoff" })
          }
        }
      }
    }
    return { done, failed }
  },
})

export const attemptLedger = () => {
  const counts = new Map<string, AttemptCounts>()
  const entryFor = (name: string) => {
    const existing = counts.get(name)
    if (existing) return existing
    const created = { started: 0, succeeded: 0, failed: 0 }
    counts.set(name, created)
    return created
  }
  const extension: Lite.Extension = {
    name: "attempt-ledger",
    async wrapExec(next, _target, ctx) {
      const entry = entryFor(ctx.name ?? "anonymous")
      entry.started += 1
      try {
        const output = await next()
        entry.succeeded += 1
        return output
      } catch (error) {
        entry.failed += 1
        throw error
      }
    },
  }
  return {
    extension,
    counts: () => Object.fromEntries([...counts].map(([name, entry]) => [name, { ...entry }])),
  }
}
