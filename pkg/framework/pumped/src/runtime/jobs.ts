import { isAtom, type Lite } from "@pumped-fn/lite"
import { backend as schedulerBackend } from "@pumped-fn/lite-extension-scheduler"
import { createAppScope, defaultSchedulerBackend } from "./app-scope"
import type { Manifest, ManifestEntry } from "./manifest"

export interface JobsIo {
  onDefaultBackend?(): void
}

export interface JobsRunner {
  stop(): Promise<void>
}

export function runJobs(manifest: Manifest, io?: JobsIo, scope?: Lite.Scope): JobsRunner {
  const ownsScope = scope === undefined
  const appScope = scope ?? createAppScope(manifest)

  if (schedulerBackend.find(appScope as unknown as Lite.TagSource) === defaultSchedulerBackend) {
    io?.onDefaultBackend?.()
  }

  const entries = manifest.entries.filter((entry) => entry.kind === "jobs")
  const registrations = entries.map((entry: ManifestEntry) => {
    if (!isAtom(entry.schedule)) {
      throw new Error(
        `jobs entry "${entry.name}" must default-export a schedule() atom from @pumped-fn/lite-extension-scheduler`
      )
    }
    const registration = appScope.resolve(entry.schedule)
    registration.catch(() => {})
    return registration
  })

  return {
    async stop() {
      await Promise.all(registrations)
      if (ownsScope) await appScope.dispose()
    },
  }
}
