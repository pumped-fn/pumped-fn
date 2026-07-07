import { createScope, type Lite } from "@pumped-fn/lite"
import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { observable, type Observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { pathToFileURL } from "node:url"
import { awaitDrained, dailyReportJob, ingest, intake, sendRemindersJob, watchReviewQueue } from "./flows"
import { heuristic, queueSignal, stopping, storedSignal } from "./ports"

export function createInvoiceScope(options: {
  readonly extensions?: Lite.ScopeOptions["extensions"]
  readonly presets?: Lite.ScopeOptions["presets"]
  readonly tags?: Lite.ScopeOptions["tags"]
  readonly logSink?: Logging.Sink
  readonly observableSinks?: readonly Observable.Sink[]
} = {}): Lite.Scope {
  return createScope({
    extensions: [observable.extension(), logging.extension(), ...(options.extensions ?? [])],
    presets: options.presets,
    tags: [
      scheduler.backend(scheduler.inProcess()),
      logging.runtime({
        sinks: [options.logSink ?? stdout()],
        level: "info",
        flow: "errors",
        fields: { service: "invoice-triage" },
      }),
      observable.runtime({
        sinks: options.observableSinks ?? [otel.sink()],
      }),
      provider(heuristic),
      ...(options.tags ?? []),
    ],
  })
}

export async function startWorkers(scope: Lite.Scope): Promise<{
  readonly scope: Lite.Scope
  readonly ctx: Lite.ExecutionContext
  readonly ingest: Promise<void>
  readonly watching: Promise<void>
}> {
  const ctx = scope.createContext()
  const running = {
    scope,
    ctx,
    ingest: ctx.exec({ flow: ingest }),
    watching: ctx.exec({ flow: watchReviewQueue }),
  }
  await ctx.resolve(dailyReportJob)
  await ctx.resolve(sendRemindersJob)
  return running
}

export async function requestStop(scope: Lite.Scope): Promise<void> {
  const [stop, queue, stored] = await Promise.all([
    scope.controller(stopping, { resolve: true }),
    scope.controller(queueSignal, { resolve: true }),
    scope.controller(storedSignal, { resolve: true }),
  ])
  stop.update(() => true)
  queue.update((value) => value + 1)
  stored.update((value) => value + 1)
}

export async function stopWorkers(workers: Awaited<ReturnType<typeof startWorkers>>): Promise<void> {
  await requestStop(workers.scope)
  const outcomes = await Promise.allSettled([workers.ingest, workers.watching])
  const failed = outcomes.find((outcome) => outcome.status === "rejected")
  if (failed?.status === "rejected") {
    await workers.ctx.close({ ok: false, error: failed.reason })
    throw failed.reason
  }
  await workers.ctx.close({ ok: true })
}

export async function runDaemon(scope = createInvoiceScope()): Promise<void> {
  const stopIntake = () => process.stdin.destroy()
  process.once("SIGINT", stopIntake)
  let workers: Awaited<ReturnType<typeof startWorkers>> | undefined

  try {
    workers = await startWorkers(scope)
    await runIntake(scope)
  } finally {
    if (workers) await stopWorkers(workers)
    process.off("SIGINT", stopIntake)
    await scope.dispose()
  }
}

export async function main(): Promise<void> {
  await runDaemon()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main()
}

function stdout(): Logging.Sink {
  return {
    name: "stdout",
    write: (record) => console.log(JSON.stringify(record)),
  }
}

async function runIntake(scope: Lite.Scope): Promise<void> {
  const ctx = scope.createContext()
  try {
    await ctx.exec({ flow: intake })
    await ctx.exec({ flow: awaitDrained })
    await ctx.close({ ok: true })
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
}
