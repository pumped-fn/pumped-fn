import { createScope } from "@pumped-fn/lite"
import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { codex } from "@pumped-fn/sdk-codex"
import { prepareDatabase } from "./invoice-database-operations"
import { ingest } from "./invoice-intake"
import { dailyReportJob, sendRemindersJob, watchReviewQueue } from "./invoice-reporting"
import { databaseEngine, databaseStartup, mailer, postgresDatabase, type Mailer } from "./invoice-runtime"
import type { DatabaseStartupMode } from "./invoice-migrations"

export interface MainOptions {
  databaseUrl?: string
  startup?: DatabaseStartupMode
}

export async function main(options: MainOptions = {}): Promise<void> {
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
      codex(),
      databaseStartup(options.startup ?? "migrate"),
      mailer(reminders),
      ...(options.databaseUrl === undefined ? [] : [
        databaseEngine(postgresDatabase({ connectionString: options.databaseUrl })),
      ]),
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
