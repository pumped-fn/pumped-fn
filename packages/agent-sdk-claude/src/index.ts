import { claudeHarness, model, type CliHarnessOptions, type Model } from "@pumped-fn/agent-sdk"
import type { Lite } from "@pumped-fn/lite"

export type ClaudeOptions = CliHarnessOptions

export function claude(options: ClaudeOptions = {}): Lite.Tagged<Model> {
  return model(lazyModel(() => claudeHarness(options)))
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

export { claudeCliWorker, claudeHarness, type ClaudeCliWorkerOptions, type CliHarnessOptions } from "@pumped-fn/agent-sdk"
