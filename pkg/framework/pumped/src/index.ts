import { route, command, schedule, workflowRun, jobRun } from "./tags"
import { pumped as pumpedPlugin } from "./plugin"
import { createServer } from "./runtime/serve"
import { runCli } from "./runtime/cli"
import { runJobs } from "./runtime/jobs"
import { runWorkflows } from "./runtime/workflows"
import { createAppScope } from "./runtime/app-scope"
import { normalizeAgentEntry } from "./runtime/agent"
import { entry } from "./entry"

export const pumped = {
  route,
  command,
  schedule,
  workflowRun,
  jobRun,
  plugin: pumpedPlugin,
  createServer,
  createAppScope,
  runCli,
  runJobs,
  runWorkflows,
  entry,
} as const

export namespace pumped {
  export type RouteMeta = import("./tags").RouteMeta
  export type CommandMeta = import("./tags").CommandMeta
  export type ScheduleMeta = import("./tags").ScheduleMeta
  export type WorkflowRunMeta = import("./tags").WorkflowRunMeta
  export type JobRunMeta = import("./tags").JobRunMeta
  export type Manifest = import("./runtime/manifest").Manifest
  export type ManifestEntry = import("./runtime/manifest").ManifestEntry
  export type ManifestAgentMeta = import("./runtime/manifest").ManifestAgentMeta
  export type Config = import("./runtime/manifest").AppConfig
  export type Options = import("./plugin").PumpedOptions
  export type JobsIo = import("./runtime/jobs").JobsIo
  export type JobsRunner = import("./runtime/jobs").JobsRunner
  export type WorkflowsIo = import("./runtime/workflows").WorkflowsIo
  export type WorkflowsRunner = import("./runtime/workflows").WorkflowsRunner
}

export type { EntryDescriptor, EntryKind } from "./discover"
export { discover } from "./discover"
export { generateManifest } from "./codegen"
export { normalizeAgentEntry } from "./runtime/agent"
