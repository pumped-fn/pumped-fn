import type { Lite } from "@pumped-fn/lite"
import { randomUUID } from "node:crypto"
import { Cron } from "croner"
import { jobRun, schedule } from "../tags"
import { createAppScope } from "./app-scope"
import type { Manifest, ManifestEntry } from "./manifest"

export interface JobsIo {
  onError(entry: ManifestEntry, error: unknown, mapped?: { status: number; body: unknown }): void
}

export interface JobsRunner {
  tick(entry: ManifestEntry): Promise<void>
  stop(): Promise<void>
}

function resolveSchedule(entry: ManifestEntry): { cron: string } {
  const meta = schedule.find(entry.flow)
  if (!meta) throw new Error(`jobs entry "${entry.name}" is missing a required schedule tag`)
  return meta
}

export function runJobs(manifest: Manifest, io?: JobsIo, scope?: Lite.Scope): JobsRunner {
  const appConfig = manifest.app
  const onError =
    io?.onError ??
    ((entry: ManifestEntry, error: unknown) => {
      process.stderr.write(`${entry.name}: ${error instanceof Error ? error.message : String(error)}\n`)
    })

  const entries = manifest.entries.filter((entry) => entry.kind === "jobs")
  const schedules = entries.map((entry) => ({ entry, cron: resolveSchedule(entry).cron }))

  const ownsScope = scope === undefined
  const appScope = scope ?? createAppScope(manifest)

  async function tick(entry: ManifestEntry): Promise<void> {
    const tags: Lite.Tagged<any>[] = [
      jobRun({ job: entry.name, tickId: randomUUID() }),
      ...(appConfig?.context?.() ?? []),
    ]
    const context = appScope.createContext({ tags })

    try {
      await context.exec({ flow: entry.flow, rawInput: undefined })
      await context.close({ ok: true })
    } catch (error) {
      await context.close({ ok: false, error })
      onError(entry, error, appConfig?.mapError?.(error))
    }
  }

  const jobs = schedules.map(({ entry, cron }) => new Cron(cron, () => tick(entry)))

  return {
    tick,
    async stop() {
      for (const job of jobs) job.stop()
      if (ownsScope) await appScope.dispose()
    },
  }
}
