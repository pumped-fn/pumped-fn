import { atom, controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

type SpeechVendor = {
  transcribe(request: { episodeId: string }): Promise<{ text: string }>
}

type Backoff = (attempt: number) => Promise<void>

type Transcript = { text: string }

type BackfillResult = {
  done: string[]
  failed: { episodeId: string; attempts: number; code: string }[]
}

type OperationCount = {
  started: number
  succeeded: number
  failed: number
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return "unknown"
  return typeof error.code === "string" ? error.code : "unknown"
}

export const speechVendor = tag<SpeechVendor>({ label: "speech.vendor" })

export const backoff = tag<Backoff>({ label: "transcript.backoff" })

const transcripts = atom({
  factory: () => new Map<string, Transcript>(),
})

export const transcribeEpisode = flow({
  name: "transcribe-episode",
  parse: typed<{ episodeId: string }>(),
  deps: {
    speechVendor: tags.required(speechVendor),
    transcripts,
  },
  factory: async (ctx, { speechVendor, transcripts }) => {
    const transcript = await ctx.exec({
      fn: () => speechVendor.transcribe({ episodeId: ctx.input.episodeId }),
      params: [],
      name: "speech.transcribe",
    })
    transcripts.set(ctx.input.episodeId, transcript)
  },
})

export const backfill = flow({
  name: "backfill",
  parse: typed<{ episodeIds: string[]; maxAttempts: number }>(),
  deps: {
    backoff: tags.required(backoff),
    transcribeEpisode: controller(transcribeEpisode),
  },
  factory: async (ctx, { backoff, transcribeEpisode }): Promise<BackfillResult> => {
    const done: string[] = []
    const failed: BackfillResult["failed"] = []

    for (const episodeId of ctx.input.episodeIds) {
      const invocation = transcribeEpisode.prepare({
        key: episodeId,
        input: { episodeId },
      })
      let attempts = 0

      while (attempts < ctx.input.maxAttempts) {
        attempts += 1
        try {
          await invocation.exec()
          done.push(episodeId)
          break
        } catch (error) {
          const code = errorCode(error)
          if (code !== "vendor-busy" || attempts === ctx.input.maxAttempts) {
            failed.push({ episodeId, attempts, code })
            break
          }
          await ctx.exec({ fn: () => backoff(attempts), params: [], name: "backoff.wait" })
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
  factory: (ctx, { transcripts }) => transcripts.get(ctx.input.episodeId) ?? null,
})

export function attemptLedger(): {
  extension: Lite.Extension
  counts: () => Record<string, OperationCount>
} {
  const operations = new Map<string, OperationCount>()

  return {
    extension: {
      name: "attempt-ledger",
      async wrapExec(next, target, ctx) {
        const name = ctx.name ?? target.name
        if (name === undefined) return next()
        const count = operations.get(name) ?? { started: 0, succeeded: 0, failed: 0 }
        count.started += 1
        operations.set(name, count)
        ctx.onClose((result) => {
          if (result.ok) count.succeeded += 1
          else count.failed += 1
        })
        return next()
      },
    },
    counts: () => Object.fromEntries(
      [...operations].map(([name, count]) => [name, { ...count }]),
    ),
  }
}
