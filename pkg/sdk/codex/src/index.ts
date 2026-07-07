import { codexHarness, model, type CodexHarnessOptions, type Model } from "@pumped-fn/sdk"
import type { Lite } from "@pumped-fn/lite"

export type CodexOptions = CodexHarnessOptions

export function codex(options: CodexOptions = {}): Lite.Tagged<Model> {
  return model(codexHarness(options))
}

export { codexCliWorker, codexHarness, type CodexCliWorkerOptions, type CodexHarnessOptions } from "@pumped-fn/sdk"
