import { createScope } from "@pumped-fn/lite"
import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { dailyReportJob, ingest, prepareDatabase, sendRemindersJob, watchReviewQueue } from "./flows"
import { databaseStartup, heuristic, mailer, type Mailer } from "./ports"

export async function main(): Promise<void> {
  const sink: Logging.Sink = {
    name: "stdout",
    write: (record) => console.log(JSON.stringify(record)),
  }
  const reminders: Mailer = {
    async send(message) {
      console.log(JSON.stringify({ event: "invoice.reminder", message }))
    },
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
      databaseStartup("migrate"),
      mailer(reminders),
    ],
  })

  const ctx = scope.createContext()
  await ctx.exec({ flow: prepareDatabase })
  const processing = ctx.exec({ flow: ingest })
  const watching = ctx.exec({ flow: watchReviewQueue })
  await ctx.resolve(dailyReportJob)
  await ctx.resolve(sendRemindersJob)
  await Promise.all([processing, watching])
}
