import type { Lite } from "@pumped-fn/lite"
import { randomUUID } from "node:crypto"
import { workflowRun } from "../tags"
import { createAppScope } from "./app-scope"
import type { Manifest, ManifestEntry } from "./manifest"

export interface WorkflowsIo {
  onError(entry: ManifestEntry, error: unknown): void
}

export interface WorkflowsRunner {
  stop(): Promise<void>
}

export function runWorkflows(manifest: Manifest, io?: WorkflowsIo, scope?: Lite.Scope): WorkflowsRunner {
  const appConfig = manifest.app
  const onError =
    io?.onError ??
    ((entry: ManifestEntry, error: unknown) => {
      process.stderr.write(`${entry.name}: ${error instanceof Error ? error.message : String(error)}\n`)
    })

  const entries = manifest.entries.filter((entry) => entry.kind === "workflows")

  const ownsScope = scope === undefined
  const appScope = scope ?? createAppScope(manifest)

  const runs = entries.map((entry) => runEntry(entry))

  async function runEntry(entry: ManifestEntry): Promise<void> {
    const tags: Lite.Tagged<any>[] = [
      workflowRun({ taskId: entry.name, runId: randomUUID() }),
      ...(appConfig?.context?.() ?? []),
    ]
    const context = appScope.createContext({ tags })

    try {
      await context.exec({ flow: entry.flow, rawInput: undefined })
      await context.close({ ok: true })
    } catch (error) {
      await context.close({ ok: false, error })
      onError(entry, error)
    }
  }

  return {
    async stop() {
      await Promise.allSettled(runs)
      if (ownsScope) await appScope.dispose()
    },
  }
}
