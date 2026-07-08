import { atom, ParseError, type Lite } from "@pumped-fn/lite"
import { Hono, type Context } from "hono"
import { dailyReport, enqueue, listAudit, listPending } from "./flows"

const invalid = Symbol("invalid")

export const app = atom({
  factory: (ctx): Hono => {
    const routes = new Hono()
    const execute = async <Output, Input, Yield = never>(
      options: Lite.ExecFlowOptions<Output, Input, Yield>
    ): Promise<Output> => {
      const request = ctx.scope.createContext()
      try {
        const output = await request.exec(options)
        await request.close({ ok: true })
        return output
      } catch (error) {
        await request.close({ ok: false, error })
        throw error
      }
    }

    routes.post("/invoices", async (context) => {
      const body = await readJson(context)
      if (body === invalid) return context.json({ accepted: 0, rejected: 1 }, 400)

      try {
        const summary = await execute({ flow: enqueue, rawInput: body })
        return context.json({ accepted: summary.accepted, rejected: 0 })
      } catch (error) {
        return mapParse(context, error)
      }
    })

    routes.get("/report", async (context) => context.json(await execute({ flow: dailyReport })))

    routes.get("/audit", async (context) => context.json(await execute({ flow: listAudit })))

    routes.get("/health", async (context) => {
      const pending = await execute({ flow: listPending })
      return context.json({ ok: true, pending: pending.length })
    })

    return routes
  },
})

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
