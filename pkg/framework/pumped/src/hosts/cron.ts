import { atom, tags, type Lite } from "@pumped-fn/lite"
import type { Entry } from "../entry"
import type { Manifest } from "../runtime/manifest"
import { cronTick, schedule, type ScheduleSpec } from "../tags"
import { HostStartError, selectEntries, type Host, type HostRuntime } from "./host"

/** Receives tick and registration failures instead of the default stderr line. */
export interface CronIo {
  onError(name: string, error: unknown): void
}

interface PlannedJob {
  name: string
  entryName: string
  spec: ScheduleSpec
  tick(flow: Lite.Flow<any, any, any, any>): (run: { key: string; scheduledAt: Date }) => Promise<void>
}

export const cronHost: Host<ScheduleSpec, { io?: CronIo }> = Object.freeze({
  name: "cron",
  selector: schedule,
  provides: Object.freeze([cronTick]),
  start({ scope, manifest, io }: { scope: Lite.Scope; manifest: Manifest; io?: CronIo }): HostRuntime {
    const onError =
      io?.onError ??
      ((name: string, error: unknown) => {
        process.stderr.write(`${name}: ${error instanceof Error ? error.message : String(error)}\n`)
      })

    const selections = selectEntries(manifest, schedule)
    const jobs: { job: PlannedJob; entry: (typeof selections)[number]["entry"] }[] = []
    const names = new Map<string, string>()

    for (const selection of selections) {
      for (const mount of selection.mounts) {
        const name = mount.spec.name ?? selection.name
        const existing = names.get(name)
        if (existing) {
          throw new HostStartError("duplicate-schedule", `duplicate schedule "${name}": ${existing}, ${selection.name}`)
        }
        names.set(name, selection.name)

        jobs.push({
          entry: selection.entry,
          job: {
            name,
            entryName: selection.name,
            spec: mount.spec,
            tick: (flow) => async (run) => {
              await scope.run({
                flow,
                rawInput: undefined,
                tags: [cronTick({ name, key: run.key, scheduledAt: run.scheduledAt }), mount.tagged, selection.tags],
              })
            },
          },
        })
      }
    }

    const runtime = (async () => {
      if (jobs.length === 0) return undefined

      const scheduler = await import("@pumped-fn/lite-extension-scheduler")
      const configured = await scope.resolve(
        atom({ deps: { backend: tags.optional(scheduler.backend) }, factory: (_ctx, { backend }) => backend })
      )
      const bundleDeps: Record<string, Entry<any, any>> = Object.fromEntries(
        jobs.map(({ entry }, index) => [`entry${index}`, entry])
      )
      const bundles = await scope.resolve(atom({ deps: bundleDeps, factory: (_ctx, deps) => deps }))
      const backend = configured ?? scheduler.inProcess()

      const node = atom({
        factory: (ctx) => {
          jobs.forEach(({ job }, index) => {
            try {
              const registration = backend.register(
                {
                  name: job.name,
                  cadence: "cron" in job.spec ? { cron: job.spec.cron } : { every: job.spec.every },
                  overlap: job.spec.overlap ?? "skip",
                  catchUp: job.spec.catchUp ?? "skip",
                  onError: (error) => onError(job.name, error),
                },
                job.tick(bundles[`entry${index}`]!.flow)
              )
              ctx.cleanup((target) => target.stop(), registration)
            } catch (error) {
              throw new HostStartError(
                "schedule-registration",
                `schedule "${job.name}" in entry "${job.entryName}" failed to register: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error }
              )
            }
          })
          return { count: jobs.length }
        },
      })
      await scope.resolve(node)
      return node
    })()

    return {
      ready: runtime.then(() => undefined),
      stop: async () => {
        const node = await runtime.catch(() => undefined)
        if (node) await scope.release(node)
      },
    }
  },
})
