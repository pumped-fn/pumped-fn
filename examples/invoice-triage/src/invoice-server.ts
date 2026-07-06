import { createScope, type Lite } from "@pumped-fn/lite"
import { serve } from "@hono/node-server"
import { Hono, type Context } from "hono"
import { prepareDatabase } from "./invoice-database-operations"
import {
  enqueue,
  ingest,
  listAuditEvents,
  listPendingInvoices,
  listStoredInvoices,
} from "./invoice-intake"
import {
  dailyReport,
  dailyReportJob,
  sendReminders,
  sendRemindersJob,
  watchReviewQueue,
} from "./invoice-reporting"
import { databaseStartup } from "./invoice-runtime"
import { importBatch } from "./invoice-triage"
import type { DatabaseStartupMode } from "./invoice-migrations"

const invalidJson = Symbol("invalid-json")

export interface InvoiceServerOptions {
  extensions?: readonly Lite.Extension[]
  tags?: readonly Lite.Tagged<any>[]
}

export interface StartInvoiceServerOptions extends InvoiceServerOptions {
  port: number
  hostname?: string
  startup?: DatabaseStartupMode
}

export function createInvoiceServer(options: InvoiceServerOptions = {}) {
  const scope = createScope({
    extensions: options.extensions === undefined ? undefined : [...options.extensions],
    tags: options.tags === undefined ? undefined : [...options.tags],
  })
  const app = new Hono()

  app.get("/health", (context) => context.json({ ok: true }))
  app.post("/invoices", async (context) => jsonBodyFlow(context, scope, enqueue))
  app.post("/imports", async (context) => jsonBodyFlow(context, scope, importBatch))
  app.get("/pending", async (context) => jsonFlow(context, scope, listPendingInvoices))
  app.get("/invoices", async (context) => jsonFlow(context, scope, listStoredInvoices))
  app.get("/audit", async (context) => jsonFlow(context, scope, listAuditEvents))
  app.get("/report", async (context) => jsonFlow(context, scope, dailyReport))
  app.post("/reminders/send", async (context) => jsonFlow(context, scope, sendReminders))

  return { app, scope }
}

export async function startInvoiceServer(options: StartInvoiceServerOptions) {
  const { app, scope } = createInvoiceServer(options)
  const startup = scope.createContext({ tags: [databaseStartup(options.startup ?? "migrate")] })
  await startup.exec({ flow: prepareDatabase })
  await startup.close({ ok: true })
  const runtime = scope.createContext()
  const processing = runtime.exec({ flow: ingest })
  const watching = runtime.exec({ flow: watchReviewQueue })
  await runtime.resolve(dailyReportJob)
  await runtime.resolve(sendRemindersJob)
  const server = serve({
    fetch: app.fetch,
    port: options.port,
    hostname: options.hostname,
  })
  return { app, scope, runtime, processing, watching, server }
}

async function jsonBodyFlow<Output, Input>(
  context: Context,
  scope: Lite.Scope,
  flow: Lite.Flow<Output, Input, any, any>
) {
  const rawInput = await readJsonBody(context.req)
  if (rawInput === invalidJson) return context.json({ error: "invalid JSON body" }, 400)
  return jsonFlow(context, scope, flow, rawInput)
}

async function jsonFlow<Output, Input>(
  context: Context,
  scope: Lite.Scope,
  flow: Lite.Flow<Output, Input, any, any>,
  rawInput?: unknown
) {
  try {
    return context.json(await exec(scope, flow, rawInput))
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
}

async function exec<Output, Input>(
  scope: Lite.Scope,
  flow: Lite.Flow<Output, Input, any, any>,
  rawInput?: unknown
): Promise<Output> {
  const ctx = scope.createContext()
  try {
    const output = await ctx.exec({ flow, rawInput })
    await ctx.close({ ok: true })
    return output
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
}

async function readJsonBody(request: { text(): Promise<string> }): Promise<unknown> {
  const raw = await request.text()
  if (raw.trim() === "") return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return invalidJson
  }
}
