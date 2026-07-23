import { controller, flow, tags, typed } from "@pumped-fn/lite"
import { z } from "zod"
import { config } from "./config.js"
import { request } from "./http.js"
import { digest, ports, TriageError, type Evidence, type VictoriaRead } from "./triage.js"

const responseShape = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.string(),
    result: z.array(z.unknown()),
  }),
}).passthrough()

export const victoria = flow({
  name: "issue-triage.victoria.read",
  parse: typed<VictoriaRead>(),
  deps: {
    config: tags.required(config.victoria),
    plan: tags.required(config.plan),
    clock: tags.required(config.clock),
    request: controller(request),
  },
  factory: async (ctx, { config, plan, clock, request }): Promise<Evidence> => {
    const start = Date.parse(ctx.input.windowStart)
    const end = Date.parse(ctx.input.windowEnd)
    if (ctx.input.query !== plan.victoriaQuery
      || !Number.isFinite(start)
      || !Number.isFinite(end)
      || end <= start
      || end - start > plan.victoriaMaxWindowMs) {
      throw new TriageError("authorize", ctx.input.query, "Victoria request does not match the configured bounded query")
    }
    const url = new URL("/api/v1/query_range", config.url)
    url.searchParams.set("query", ctx.input.query)
    url.searchParams.set("start", String(start / 1_000))
    url.searchParams.set("end", String(end / 1_000))
    url.searchParams.set("step", String(Math.max(1, Math.floor((end - start) / 60_000))))
    const response = await request.exec({
      input: {
        url: url.href,
        method: "GET",
        headers: config.tenant === undefined ? {} : { "AccountID": config.tenant },
      },
    })
    if (response.status < 200 || response.status >= 300) throw new TriageError("evidence", ctx.input.query, `Victoria returned HTTP ${response.status}`)
    const value = responseShape.parse(JSON.parse(new TextDecoder().decode(response.body)))
    return {
      id: `victoria:${digest(ctx.input)}`,
      source: "victoria",
      citation: `victoria://query-range?query=${encodeURIComponent(digest(ctx.input))}&start=${ctx.input.windowStart}&end=${ctx.input.windowEnd}`,
      capturedAt: new Date(clock()).toISOString(),
      maxAgeMs: plan.evidenceMaxAgeMs,
      queryIdentity: digest(ctx.input),
      capabilityScope: "victoria:bounded-read",
      summary: JSON.stringify(value.data),
    }
  },
})

export const victoriaBinding = ports.victoria(victoria)
