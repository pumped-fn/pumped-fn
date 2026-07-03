import { tag } from "@pumped-fn/lite"

export interface RouteMeta {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path?: string
}

export interface CommandMeta {
  name?: string
  description?: string
}

export interface ScheduleMeta {
  cron: string
}

export interface WorkflowRunMeta {
  taskId: string
  runId: string
}

export interface JobRunMeta {
  job: string
  tickId: string
}

export const route = tag<RouteMeta>({ label: "app.route" })
export const command = tag<CommandMeta>({ label: "app.command" })
export const schedule = tag<ScheduleMeta>({ label: "app.schedule" })
export const workflowRun = tag<WorkflowRunMeta>({ label: "app.workflowRun" })
export const jobRun = tag<JobRunMeta>({ label: "app.jobRun" })
