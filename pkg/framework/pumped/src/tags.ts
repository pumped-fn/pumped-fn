import { tag } from "@pumped-fn/lite"

export interface RouteMeta {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path?: string
}

export interface CommandMeta {
  name?: string
  description?: string
}

/**
 * Freeform `{ cron: string }` metadata tag. No longer consulted by `runJobs` — `src/jobs/*.ts`
 * entries schedule themselves via `scheduler.schedule({ cadence: { cron } })` from
 * `@pumped-fn/lite-extension-scheduler`. Kept for callers with their own uses for a cron-shaped tag.
 */
export interface ScheduleMeta {
  cron: string
}

export interface WorkflowRunMeta {
  taskId: string
  runId: string
}

/**
 * `{ job, tickId }` metadata tag, mirroring `workflowRun`. `runJobs` no longer stamps this
 * automatically: context creation for a job tick is now owned by the `schedule()` atom's own
 * backend (`@pumped-fn/lite-extension-scheduler`), which has no seam for pumped-specific tags.
 * Kept for callers who tag their own job flows with it directly.
 */
export interface JobRunMeta {
  job: string
  tickId: string
}

export const route = tag<RouteMeta>({ label: "app.route" })
export const command = tag<CommandMeta>({ label: "app.command" })
export const schedule = tag<ScheduleMeta>({ label: "app.schedule" })
export const workflowRun = tag<WorkflowRunMeta>({ label: "app.workflowRun" })
export const jobRun = tag<JobRunMeta>({ label: "app.jobRun" })
