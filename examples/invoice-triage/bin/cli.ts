import { createScope, type Lite } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { cac } from "cac"
import { pathToFileURL } from "node:url"
import { dailyReport, listAudit, listPending, sendReminders } from "../src/flows"
import { consoleNotifier, notifier } from "../src/notifier"
import { heuristic } from "../src/ports"

type Command = typeof dailyReport | typeof listAudit | typeof listPending | typeof sendReminders

async function main(): Promise<void> {
  const program = cac("invoice-triage")

  program.command("report", "Print the daily report").action(() => execute(dailyReport))
  program.command("audit", "Print the audit trail").action(() => execute(listAudit))
  program.command("pending", "Print pending invoices").action(() => execute(listPending))
  program.command("remind", "Send due reminders").action(() => execute(sendReminders))

  program.help()
  program.parse(process.argv, { run: false })
  await program.runMatchedCommand()
}

async function execute<Output, Flow extends Command & Lite.Flow<Output, void>>(flow: Flow): Promise<void> {
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
      notifier(consoleNotifier()),
    ],
  })
  const ctx = scope.createContext()

  try {
    const output = await ctx.exec<Output, void>({ flow })
    process.stdout.write(`${JSON.stringify(output, undefined, 2)}\n`)
    await ctx.close({ ok: true })
  } catch (error) {
    await ctx.close({ ok: false, error })
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  } finally {
    await scope.dispose()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
