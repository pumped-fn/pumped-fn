import { cac } from "cac"
import { dailyReport, listAudit, listPending, sendReminders } from "../src/flows"
import { createInvoiceScope } from "../src/main"

const program = cac("invoice-triage")

program.command("report", "Print the daily report").action(() => run((ctx) => ctx.exec({ flow: dailyReport })))
program.command("audit", "Print the audit trail").action(() => run((ctx) => ctx.exec({ flow: listAudit })))
program.command("pending", "Print pending invoices").action(() => run((ctx) => ctx.exec({ flow: listPending })))
program.command("remind", "Send due reminders").action(() => run((ctx) => ctx.exec({ flow: sendReminders })))

program.help()
program.parse(process.argv, { run: false })
await program.runMatchedCommand()

async function run<Output>(task: Parameters<typeof withContext<Output>>[1]): Promise<void> {
  const scope = createInvoiceScope()
  try {
    process.stdout.write(`${JSON.stringify(await withContext(scope, task), undefined, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  } finally {
    await scope.dispose()
  }
}

async function withContext<Output>(
  scope: ReturnType<typeof createInvoiceScope>,
  task: (ctx: ReturnType<typeof scope.createContext>) => Promise<Output>
): Promise<Output> {
  const ctx = scope.createContext()
  try {
    const output = await task(ctx)
    await ctx.close({ ok: true })
    return output
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
}
