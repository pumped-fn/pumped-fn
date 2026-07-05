import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { pathToFileURL } from "node:url"
import { awaitImported, enqueue, ingest, registerCron, watchReviewQueue } from "./flows"
import type { Invoice } from "./domain"
import { heuristic } from "./ports"

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

  const ctx = scope.createContext()
  const processing = ctx.exec({ flow: ingest })
  const watching = ctx.exec({ flow: watchReviewQueue })
  await ctx.exec({ flow: registerCron })
  await ctx.exec({ flow: enqueue, input: { invoices: demo } })
  await ctx.exec({ flow: awaitImported, input: { count: demo.length } })
  await ctx.close({ ok: true })
  await scope.dispose()
  await Promise.allSettled([processing, watching])
  process.off("SIGINT", stop)
  for (const record of sink.records()) console.log(JSON.stringify(record))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main()
}
