import { serve } from "@hono/node-server"
import { createScope, ParseError, type Lite } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { Hono } from "hono"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { dailyReport, dailyReportJob, enqueue, ingest, listAudit, listPending, sendRemindersJob, stop, watchReviewQueue } from "../src/flows"
import { consoleNotifier, notifier } from "../src/notifier"
import { heuristic, requestId } from "../src/ports"

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
    notifier(consoleNotifier()),
  ],
})

export const app = new Hono<{ Variables: { ctx: Lite.ExecutionContext } }>()

app.use(async (context, next) => {
  const ctx = scope.createContext({ tags: [requestId(randomUUID())] })
  context.set("ctx", ctx)
  try {
    await next()
    await ctx.close(context.error === undefined ? { ok: true } : { ok: false, error: context.error })
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
})

app.onError((error, context) => {
  if (error instanceof ParseError) return context.json({ accepted: 0, rejected: 1 }, 400)
  return context.json({ error: "internal" }, 500)
})

app.post("/invoices", async (context) => {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return context.json({ accepted: 0, rejected: 1 }, 400)
  }
  const summary = await context.var.ctx.exec({ flow: enqueue, rawInput: body })
  return context.json({ accepted: summary.accepted, rejected: 0 })
})

app.get("/report", async (context) => context.json(await context.var.ctx.exec({ flow: dailyReport })))

app.get("/audit", async (context) => context.json(await context.var.ctx.exec({ flow: listAudit })))

app.get("/health", async (context) => {
  const pending = await context.var.ctx.exec({ flow: listPending })
  return context.json({ ok: true, pending: pending.length })
})

async function main(): Promise<void> {
  const ctx = scope.createContext()
  const ingesting = ctx.exec({ flow: ingest })
  const watching = ctx.exec({ flow: watchReviewQueue })

  await ctx.resolve(dailyReportJob)
  await ctx.resolve(sendRemindersJob)

  const server = serve({ fetch: app.fetch, port })
  let closing: Promise<void> | undefined

  function closeServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

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

  function onSignal(): void {
    void shutdown().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
  }

  process.once("SIGINT", onSignal)
  process.once("SIGTERM", onSignal)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
