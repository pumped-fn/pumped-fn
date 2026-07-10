import { controller, flow, tag, tags, typed } from "@pumped-fn/lite"

export type SpeechVendor = {
  transcribe: (request: { episodeId: string }) => Promise<{ text: string }>
}

export const speechVendor = tag<SpeechVendor>({ label: "speech.vendor" })

type TranscribeFault = { code: string; episodeId: string }

export const transcribeEpisode = flow({
  name: "transcribe-episode",
  parse: typed<{ episodeId: string }>(),
  faults: typed<TranscribeFault>(),
  deps: { vendor: tags.required(speechVendor) },
  factory: async (ctx, { vendor }) => {
    const { episodeId } = ctx.input
    try {
      const { text } = await ctx.exec({
        fn: () => vendor.transcribe({ episodeId }),
        params: [],
        name: "vendor-call",
      })
      return { episodeId, chars: text.length }
    } catch (error) {
      return ctx.fail({ code: error instanceof Error ? error.message : "error", episodeId })
    }
  },
})

export const backfill = flow({
  name: "backfill",
  parse: typed<{ episodeIds: string[]; maxAttempts: number }>(),
  deps: { transcribe: controller(transcribeEpisode) },
  factory: async (ctx, { transcribe }) => {
    const done: string[] = []
    const failed: { episodeId: string; attempts: number; code: string }[] = []
    for (const episodeId of ctx.input.episodeIds) {
      let attempts = 0
      let landed = false
      while (!landed && attempts < ctx.input.maxAttempts) {
        attempts += 1
        try {
          await transcribe.exec({ input: { episodeId } })
          done.push(episodeId)
          landed = true
        } catch {
          if (attempts >= ctx.input.maxAttempts) {
            failed.push({ episodeId, attempts, code: "exhausted" })
          }
        }
      }
    }
    return { done, failed }
  },
})
