import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { pathToFileURL } from "node:url"
import { enqueue, registerCron, reviewQueue, runIngest } from "./flows"
import { heuristic, store } from "./ports"
import type { Invoice } from "./domain"

const demo: readonly Invoice[] = [
  {
    id: "inv-demo-1",
    vendor: "Northwind Utilities",
    amount: 420,
    dueDate: "2026-07-08",
    description: "electric utility service",
  },
  {
    id: "inv-demo-2",
    vendor: "Contoso Hardware",
    amount: 4_800,
    dueDate: "2026-07-11",
    description: "server replacement hardware",
  },
]

export async function main(): Promise<void> {
  const sink = logging.memory()
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
  const stop = () => void scope.dispose()
  process.once("SIGINT", stop)

  const log = logReviewQueue(scope)
  const ingest = runIngest(scope)
  const ctx = scope.createContext()
  await ctx.exec({ flow: registerCron })
  await ctx.exec({ flow: enqueue, input: { invoices: demo } })
  await ctx.close({ ok: true })
  await waitForInvoices(scope, demo.length)
  await scope.dispose()
  await ingest
  await log
  process.off("SIGINT", stop)
  for (const record of sink.records()) console.log(JSON.stringify(record))
}

async function logReviewQueue(scope: ReturnType<typeof createScope>): Promise<void> {
  const ctx = scope.createContext()
  const logger = await ctx.resolve(logging.logger)
  for await (const count of scope.changes(await reviewQueue(scope))) logger.info("invoice.reviewQueue", { count })
  await ctx.close({ ok: true })
}

async function waitForInvoices(scope: ReturnType<typeof createScope>, count: number): Promise<void> {
  const imported = scope.select(store, (state) => state.invoices.length)
  for await (const value of scope.changes(imported)) {
    if (value >= count) break
  }
  imported.dispose()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main()
}
