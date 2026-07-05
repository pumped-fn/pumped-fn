import { createScope } from "@pumped-fn/lite"
import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { pathToFileURL } from "node:url"
import { awaitDrained, dailyReportJob, ingest, intake, sendRemindersJob, watchReviewQueue } from "./flows"
import { heuristic } from "./ports"

export async function main(): Promise<void> {
  const sink: Logging.Sink = {
    name: "stdout",
    write: (record) => console.log(JSON.stringify(record)),
  }
  const scope = createScope({
    extensions: [logging.extension()],
    tags: [
      scheduler.backend(scheduler.inProcess()),
      logging.runtime({
        sinks: [sink],
        level: "info",
        flow: "errors",
        fields: { service: "invoice-triage" },
      }),
      provider(heuristic),
    ],
  })
  const stopIntake = () => process.stdin.destroy()
  process.once("SIGINT", stopIntake)

  const ctx = scope.createContext()
  const processing = ctx.exec({ flow: ingest })
  const watching = ctx.exec({ flow: watchReviewQueue })
  await ctx.resolve(dailyReportJob)
  await ctx.resolve(sendRemindersJob)
  await ctx.exec({ flow: intake })
  await ctx.exec({ flow: awaitDrained })
  await ctx.close({ ok: true })
  await scope.dispose()
  await Promise.allSettled([processing, watching])
  process.off("SIGINT", stopIntake)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main()
}
