import { serve } from "@hono/node-server"
import { createScope, ParseError } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model as provider } from "@pumped-fn/sdk"
import { Hono } from "hono"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { dailyReport, dailyReportJob, enqueue, ingest, listAudit, listPending, sendRemindersJob, stop, watchReviewQueue } from "../src/flows"
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
  ],
})

export const app = new Hono()

app.post("/invoices", async (context) => {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return context.json({ accepted: 0, rejected: 1 }, 400)
  }
  const request = scope.createContext({ tags: [requestId(randomUUID())] })
  try {
    const summary = await request.exec({ flow: enqueue, rawInput: body })
    await request.close({ ok: true })
    return context.json({ accepted: summary.accepted, rejected: 0 })
  } catch (error) {
    await request.close({ ok: false, error })
    if (error instanceof ParseError) return context.json({ accepted: 0, rejected: 1 }, 400)
    throw error
  }
})

app.get("/report", async (context) => {
  const request = scope.createContext({ tags: [requestId(randomUUID())] })
  try {
    const report = await request.exec({ flow: dailyReport })
    await request.close({ ok: true })
    return context.json(report)
  } catch (error) {
    await request.close({ ok: false, error })
    throw error
  }
})

app.get("/audit", async (context) => {
  const request = scope.createContext({ tags: [requestId(randomUUID())] })
  try {
    const audit = await request.exec({ flow: listAudit })
    await request.close({ ok: true })
    return context.json(audit)
  } catch (error) {
    await request.close({ ok: false, error })
    throw error
  }
})

app.get("/health", async (context) => {
  const request = scope.createContext({ tags: [requestId(randomUUID())] })
  try {
    const pending = await request.exec({ flow: listPending })
    await request.close({ ok: true })
    return context.json({ ok: true, pending: pending.length })
  } catch (error) {
    await request.close({ ok: false, error })
    throw error
  }
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
