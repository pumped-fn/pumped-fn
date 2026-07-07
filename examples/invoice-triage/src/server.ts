import { ParseError, type Lite } from "@pumped-fn/lite"
import { Hono, type Context } from "hono"
import { dailyReport, enqueue, listAudit, listPending } from "./flows"

const invalid = Symbol("invalid")

export function createApp(runtime: { readonly scope: Lite.Scope }): Hono {
  const app = new Hono()

  app.post("/invoices", async (context) => {
    const body = await readJson(context)
    if (body === invalid) return context.json({ accepted: 0, rejected: 1 }, 400)

    try {
      const summary = await exec(runtime.scope, (ctx) => ctx.exec({ flow: enqueue, rawInput: body }))
      return context.json({ accepted: summary.accepted, rejected: 0 })
    } catch (error) {
      return mapParse(context, error)
    }
  })

  app.get("/report", async (context) => context.json(await exec(runtime.scope, (ctx) => ctx.exec({ flow: dailyReport }))))

  app.get("/audit", async (context) => context.json(await exec(runtime.scope, (ctx) => ctx.exec({ flow: listAudit }))))

  app.get("/health", async (context) => {
    const pending = await exec(runtime.scope, (ctx) => ctx.exec({ flow: listPending }))
    return context.json({ ok: true, pending: pending.length })
  })

  return app
}

async function exec<Output>(
  scope: Lite.Scope,
  task: (ctx: Lite.ExecutionContext) => Promise<Output>
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

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return invalid
  }
}

function mapParse(context: Context, error: unknown): Response {
  if (error instanceof ParseError) return context.json({ accepted: 0, rejected: 1 }, 400)
  throw error
}
