import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { pathToFileURL } from "node:url"
import { awaitDrained, dailyReportJob, ingest, intake, sendRemindersJob, stop, watchReviewQueue } from "../src/flows"
import { heuristic } from "../src/ports"

async function main(): Promise<void> {
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
  const ctx = scope.createContext()
  const stopIntake = () => process.stdin.destroy()

  process.once("SIGINT", stopIntake)

  const ingesting = ctx.exec({ flow: ingest })
  const watching = ctx.exec({ flow: watchReviewQueue })
  let failed = false
  let failure: unknown

  try {
    await ctx.resolve(dailyReportJob)
    await ctx.resolve(sendRemindersJob)
    await ctx.exec({ flow: intake })
    await ctx.exec({ flow: awaitDrained })
  } catch (error) {
    failed = true
    failure = error
  }

  await ctx.exec({ flow: stop })
  const [ingestOutcome, watchOutcome] = await Promise.allSettled([ingesting, watching])

  if (ingestOutcome.status === "rejected") {
    failed = true
    failure = ingestOutcome.reason
  } else if (watchOutcome.status === "rejected") {
    failed = true
    failure = watchOutcome.reason
  }

  process.off("SIGINT", stopIntake)
  await ctx.close(failed ? { ok: false, error: failure } : { ok: true })
  await scope.dispose()

  if (failed) throw failure
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
