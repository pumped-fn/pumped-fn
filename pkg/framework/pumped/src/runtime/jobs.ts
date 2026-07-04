import { isAtom, type Lite } from "@pumped-fn/lite"
import { backend as schedulerBackend } from "@pumped-fn/lite-extension-scheduler"
import { createAppScope, defaultSchedulerBackend } from "./app-scope"
import type { Manifest, ManifestEntry } from "./manifest"

export interface JobsIo {
  onDefaultBackend?(): void
}

export interface JobsRunner {
  ready: Promise<void>
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
    return { name: entry.name, registration: appScope.resolve(entry.schedule) }
  })

  const ready = Promise.all(
    registrations.map(({ name, registration }) =>
      registration.catch((error) => {
        throw new Error(`jobs entry "${name}" failed to register: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        })
      })
    )
  ).then(() => undefined)

  return {
    ready,
    async stop() {
      let firstError: unknown
      let hasError = false
      for (const { registration } of registrations) {
        try {
          await registration
        } catch (error) {
          if (!hasError) {
            firstError = error
            hasError = true
          }
        }
      }
      if (ownsScope) await appScope.dispose()
      if (hasError) throw firstError
    },
  }
}
