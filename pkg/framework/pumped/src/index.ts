import { route, command, workflowRun, jobRun } from "./tags"
import { pumped as pumpedPlugin } from "./plugin"
import { createServer } from "./runtime/serve"
import { runCli } from "./runtime/cli"
import { runJobs } from "./runtime/jobs"
import { runWorkflows } from "./runtime/workflows"
import { createAppScope } from "./runtime/app-scope"
import { normalizeAgentEntry } from "./runtime/agent"

type PumpedRouteMeta = import("./tags").RouteMeta
type PumpedCommandMeta = import("./tags").CommandMeta
type PumpedWorkflowRunMeta = import("./tags").WorkflowRunMeta
type PumpedJobRunMeta = import("./tags").JobRunMeta
type PumpedManifest = import("./runtime/manifest").Manifest
type PumpedManifestEntry = import("./runtime/manifest").ManifestEntry
type PumpedManifestAgentMeta = import("./runtime/manifest").ManifestAgentMeta
type PumpedConfig = import("./runtime/manifest").AppConfig
type PumpedOptions = import("./plugin").PumpedOptions
type PumpedJobsIo = import("./runtime/jobs").JobsIo
type PumpedJobsRunner = import("./runtime/jobs").JobsRunner
type PumpedWorkflowsIo = import("./runtime/workflows").WorkflowsIo
type PumpedWorkflowsRunner = import("./runtime/workflows").WorkflowsRunner

export const pumped = {
  route,
  command,
  workflowRun,
  jobRun,
  plugin: pumpedPlugin,
  createServer,
  createAppScope,
  runCli,
  runJobs,
  runWorkflows,
} as const

export namespace pumped {
  export type RouteMeta = PumpedRouteMeta
  export type CommandMeta = PumpedCommandMeta
  export type WorkflowRunMeta = PumpedWorkflowRunMeta
  export type JobRunMeta = PumpedJobRunMeta
  export type Manifest = PumpedManifest
  export type ManifestEntry = PumpedManifestEntry
  export type ManifestAgentMeta = PumpedManifestAgentMeta
  export type Config = PumpedConfig
  export type Options = PumpedOptions
  export type JobsIo = PumpedJobsIo
  export type JobsRunner = PumpedJobsRunner
  export type WorkflowsIo = PumpedWorkflowsIo
  export type WorkflowsRunner = PumpedWorkflowsRunner
}

export const p = pumped

export namespace p {
  export type RouteMeta = pumped.RouteMeta
  export type CommandMeta = pumped.CommandMeta
  export type WorkflowRunMeta = pumped.WorkflowRunMeta
  export type JobRunMeta = pumped.JobRunMeta
  export type Manifest = pumped.Manifest
  export type ManifestEntry = pumped.ManifestEntry
  export type ManifestAgentMeta = pumped.ManifestAgentMeta
  export type Config = pumped.Config
  export type Options = pumped.Options
  export type JobsIo = pumped.JobsIo
  export type JobsRunner = pumped.JobsRunner
  export type WorkflowsIo = pumped.WorkflowsIo
  export type WorkflowsRunner = pumped.WorkflowsRunner
}

export { route, command, workflowRun, jobRun }
export { createServer, createAppScope, runCli, runJobs, runWorkflows }
export type { EntryDescriptor, EntryKind } from "./discover"
export { discover } from "./discover"
export { generateManifest } from "./codegen"
export { normalizeAgentEntry } from "./runtime/agent"
