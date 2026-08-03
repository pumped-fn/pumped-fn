import { tag } from "@pumped-fn/lite"

/** HTTP method and path metadata for a discovered server flow. */
export interface RouteMeta {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path?: string
}

/** Name and help text metadata for a discovered CLI flow. */
export interface CommandMeta {
  name?: string
  description?: string
}

/** Task and run identity attached to a workflow execution context. */
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
export const workflowRun = tag<WorkflowRunMeta>({ label: "app.workflowRun" })
export const jobRun = tag<JobRunMeta>({ label: "app.jobRun" })
