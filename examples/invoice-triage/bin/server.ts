import { serve } from "@hono/node-server"
import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { dailyReportJob, ingest, sendRemindersJob, stop, watchReviewQueue } from "../src/flows"
import { heuristic } from "../src/ports"
import { app } from "../src/server"

const port = Number(process.env["PORT"] ?? 3000)
const scope = createScope({
  extensions: [observable.extension(), logging.extension()],
  tags: [
    scheduler.backend(scheduler.inProcess()),
    logging.runtime({
      sinks: [{
        name: "stdout",
        write: (record) => console.log(JSON.stringify(record)),
      }],
      level: "info",
      flow: "errors",
      fields: { service: "invoice-triage" },
    }),
    observable.runtime({
      sinks: [otel.sink()],
    }),
    provider(heuristic),
  ],
})
const routes = await scope.resolve(app)
const ctx = scope.createContext()
const ingesting = ctx.exec({ flow: ingest })
const watching = ctx.exec({ flow: watchReviewQueue })

await ctx.resolve(dailyReportJob)
await ctx.resolve(sendRemindersJob)

const server = serve({ fetch: routes.fetch, port })
let closing: Promise<void> | undefined

async function shutdown(): Promise<void> {
  closing ??= (async () => {
    let failed = false
    let failure: unknown
    await ctx.exec({ flow: stop })
    const [ingestOutcome, watchOutcome] = await Promise.allSettled([ingesting, watching])

    if (ingestOutcome.status === "rejected") {
      failed = true
      failure = ingestOutcome.reason
    } else if (watchOutcome.status === "rejected") {
      failed = true
      failure = watchOutcome.reason
    }

    try {
      await closeServer()
    } catch (error) {
      failed = true
      failure = error
    }

    await ctx.close(failed ? { ok: false, error: failure } : { ok: true })
    await scope.dispose()

    if (failed) throw failure
  })()
  await closing
}

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function onSignal(): void {
  void shutdown().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

process.once("SIGINT", onSignal)
process.once("SIGTERM", onSignal)
