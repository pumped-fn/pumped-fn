import { claudeHarness, model, type CliHarnessOptions, type Model } from "@pumped-fn/sdk"
import type { Lite } from "@pumped-fn/lite"

export type ClaudeOptions = CliHarnessOptions

export function claude(options: ClaudeOptions = {}): Lite.Tagged<Model> {
  return model(claudeHarness(options))
}

export { claudeCliWorker, claudeHarness, type ClaudeCliWorkerOptions, type CliHarnessOptions } from "@pumped-fn/sdk"
