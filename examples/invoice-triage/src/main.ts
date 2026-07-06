import { createScope } from "@pumped-fn/lite"
import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { codex } from "@pumped-fn/sdk-codex"
import { dailyReportJob, ingest, prepareDatabase, sendRemindersJob, watchReviewQueue } from "./flows"
import { databaseEngine, databaseStartup, mailer, postgresDatabase, type Mailer } from "./ports"
import type { DatabaseStartupMode } from "./migrations"

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
