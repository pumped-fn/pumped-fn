import { controller, flow, typed, type Lite } from "@pumped-fn/lite"
import { sync } from "@pumped-fn/lite-extension-sync"

export const draft = sync({
  id: "draft",
  factory: () => ({
    id: "draft",
    title: "Untitled",
    body: "",
    savedBy: "system",
    version: 0,
  }),
  conflict: sync.revision("version"),
})

export type Draft = Lite.Utils.AtomValue<typeof draft>

export interface SaveDraftInput {
  readonly title: string
  readonly body: string
  readonly actor: string
}

export const saveDraft = flow({
  name: "syncWeb.saveDraft",
  parse: typed<SaveDraftInput>(),
  deps: {
    draft: controller(draft, { resolve: true }),
  },
  factory: (ctx, { draft }) => {
    const current = draft.get()
    const next = {
      ...current,
      title: ctx.input.title.trim(),
      body: ctx.input.body,
      savedBy: ctx.input.actor,
      version: current.version + 1,
    }
    draft.set(next)
    return next
  },
})
