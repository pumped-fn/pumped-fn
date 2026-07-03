import { codexHarness, model, type CodexHarnessOptions, type Model } from "@pumped-fn/sdk"
import type { Lite } from "@pumped-fn/lite"

export type CodexOptions = CodexHarnessOptions

export function codex(options: CodexOptions = {}): Lite.Tagged<Model> {
  return model(lazyModel(() => codexHarness(options)))
}

function lazyModel(create: () => Model): Model {
  let target: Model | undefined
  return {
    complete(ctx, request) {
      target ??= create()
      return target.complete(ctx, request)
    },
  }
}

export { codexCliWorker, codexHarness, type CodexCliWorkerOptions, type CodexHarnessOptions } from "@pumped-fn/sdk"
