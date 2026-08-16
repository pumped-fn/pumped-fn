import { tag, type Lite } from "@pumped-fn/lite"

/** HTTP mount point for an entry. */
export interface RouteSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
}

/** CLI mount point for an entry. */
export interface CommandSpec {
  name: string
  description?: string
}

export type Cadence = { cron: string } | { every: string }

/** Cron mount point for an entry: when and how the cron host runs it. */
export type ScheduleSpec = Cadence & {
  name?: string
  overlap?: "skip" | "queue"
  catchUp?: "skip" | "last" | "all"
}

/** Boot mount point for an entry: the workflow host runs it once at startup. */
export interface WorkflowSpec {
  name?: string
}

export const route = tag<RouteSpec>({ label: "pumped.route" })
export const command = tag<CommandSpec>({ label: "pumped.command" })
export const schedule = tag<ScheduleSpec>({ label: "pumped.schedule" })
export const workflow = tag<WorkflowSpec>({ label: "pumped.workflow" })

export const httpRequest = tag<Request>({ label: "pumped.http.request" })

/** Mutable response carrier the HTTP host seeds per request and renders after exec. */
export interface HttpResponseCarrier {
  status?: number
  headers: Headers
  body?: BodyInit
}

export const httpResponse = tag<HttpResponseCarrier>({ label: "pumped.http.response" })

export const httpError = tag<(error: unknown) => { status: number; body: unknown } | undefined>({
  label: "pumped.http.error",
})

export const cronTick = tag<{ name: string; key: string; scheduledAt: Date }>({ label: "pumped.cron.tick" })

export const workflowRun = tag<{ name: string; runId: string }>({ label: "pumped.workflow.run" })

export const cliInvocation = tag<{ command: string; argv: readonly string[] }>({ label: "pumped.cli.invocation" })
