import { atom, controller, flow, isFault, tag, tags, typed, type Lite } from "@pumped-fn/lite"

type SpeechVendor = {
  transcribe(request: { episodeId: string }): Promise<{ text: string }>
}

type Backoff = (attempt: number) => Promise<void>
type TranscriptFailure = { code: string }
type AttemptCounts = { started: number; succeeded: number; failed: number }

export const speechVendor = tag<SpeechVendor>({ label: "speech.vendor" })
export const backoff = tag<Backoff>({ label: "backfill.backoff" })

const transcripts = atom({
  factory: function transcriptStore() {
    return new Map<string, string>()
  },
})

export const transcribeEpisode = flow({
  name: "transcribe-episode",
  parse: typed<{ episodeId: string }>(),
  faults: typed<TranscriptFailure>(),
  deps: {
    speechVendor: tags.required(speechVendor),
    transcripts,
  },
  factory: async (ctx, { speechVendor, transcripts }) => {
    try {
      const transcript = await ctx.exec({
        fn: () => speechVendor.transcribe({ episodeId: ctx.input.episodeId }),
        params: [],
        name: "speech.transcribe",
      })
      transcripts.set(ctx.input.episodeId, transcript.text)
      return { text: transcript.text }
    } catch (error) {
      const vendorError = error as Error & { code: string }
      return ctx.fail({ code: vendorError.code })
    }
  },
})

export const backfill = flow({
  name: "backfill",
  parse: typed<{ episodeIds: string[]; maxAttempts: number }>(),
  deps: {
    backoff: tags.required(backoff),
    transcribeEpisode: controller(transcribeEpisode),
  },
  factory: async (ctx, { backoff, transcribeEpisode }) => {
    const done: string[] = []
    const failed: { episodeId: string; attempts: number; code: string }[] = []

    for (const episodeId of ctx.input.episodeIds) {
      const invocation = transcribeEpisode.prepare({ key: episodeId, input: { episodeId } })
      await invocation.ready

      for (let attempts = 1; attempts <= ctx.input.maxAttempts; attempts += 1) {
        try {
          await invocation.exec()
          done.push(episodeId)
          break
        } catch (error) {
          if (!isFault(transcribeEpisode.flow, error)) throw error

          const code = error.fault.code
          if (code !== "vendor-busy" || attempts === ctx.input.maxAttempts) {
            failed.push({ episodeId, attempts, code })
            break
          }

          await ctx.exec({
            fn: () => backoff(attempts),
            params: [],
            name: "backfill.backoff",
          })
        }
      }
    }

    return { done, failed }
  },
})

export const getTranscript = flow({
  name: "get-transcript",
  parse: typed<{ episodeId: string }>(),
  deps: { transcripts },
  factory: (ctx, { transcripts }) => {
    const text = transcripts.get(ctx.input.episodeId)
    return text === undefined ? null : { text }
  },
})

export function attemptLedger(): { extension: Lite.Extension; counts: () => Record<string, AttemptCounts> } {
  const entries = new Map<string, AttemptCounts>()

  return {
    extension: {
      name: "attempt-ledger",
      async wrapExec(next, target, ctx) {
        const name = ctx.name ?? target.name ?? "anonymous"
        const entry = entries.get(name) ?? { started: 0, succeeded: 0, failed: 0 }
        entry.started += 1
        entries.set(name, entry)
        ctx.onClose((result) => {
          if (result.ok) entry.succeeded += 1
          else entry.failed += 1
        })
        return next()
      },
    },
    counts: () => Object.fromEntries(entries),
  }
}
