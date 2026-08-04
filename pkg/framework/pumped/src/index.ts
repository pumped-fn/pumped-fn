import { route, command, workflowRun, jobRun } from "./tags"
import { app } from "./app"
import { pumped as pumpedPlugin } from "./plugin"
import { createServer } from "./runtime/serve"
import { runCli } from "./runtime/cli"
import { runJobs } from "./runtime/jobs"
import { runWorkflows } from "./runtime/workflows"
import { createAppScope } from "./runtime/app-scope"
import { normalizeAgentEntry } from "./runtime/agent"
import { analyze } from "./analyze"

type PumpedRouteMeta = import("./tags").RouteMeta
type PumpedCommandMeta = import("./tags").CommandMeta
type PumpedWorkflowRunMeta = import("./tags").WorkflowRunMeta
type PumpedJobRunMeta = import("./tags").JobRunMeta
type PumpedManifest = import("./runtime/manifest").Manifest
type PumpedManifestIdentity = import("./runtime/manifest").ManifestIdentity
type PumpedManifestEntry = import("./runtime/manifest").ManifestEntry
type PumpedManifestGenerationOptions = import("./codegen").ManifestGenerationOptions
type PumpedManifestAgentMeta = import("./runtime/manifest").ManifestAgentMeta
type PumpedConfig = import("./runtime/manifest").AppConfig
type PumpedOptions = import("./plugin").PumpedOptions
type PumpedJobsIo = import("./runtime/jobs").JobsIo
type PumpedJobsRunner = import("./runtime/jobs").JobsRunner
type PumpedWorkflowsIo = import("./runtime/workflows").WorkflowsIo
type PumpedWorkflowsRunner = import("./runtime/workflows").WorkflowsRunner
type PumpedGraphNode = import("./analyze").GraphNode
type PumpedGraphEdge = import("./analyze").GraphEdge
type PumpedGraphUnknown = import("./analyze").GraphUnknown
type PumpedGraphReport = import("./analyze").GraphReport

export const pumped = {
  app,
  analyze,
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
  export type ManifestIdentity = PumpedManifestIdentity
  export type ManifestEntry = PumpedManifestEntry
  export type ManifestGenerationOptions = PumpedManifestGenerationOptions
  export type ManifestAgentMeta = PumpedManifestAgentMeta
  export type Config = PumpedConfig
  export type Options = PumpedOptions
  export type JobsIo = PumpedJobsIo
  export type JobsRunner = PumpedJobsRunner
  export type WorkflowsIo = PumpedWorkflowsIo
  export type WorkflowsRunner = PumpedWorkflowsRunner
  export type GraphNode = PumpedGraphNode
  export type GraphEdge = PumpedGraphEdge
  export type GraphUnknown = PumpedGraphUnknown
  export type GraphReport = PumpedGraphReport
}

export const p = pumped

export namespace p {
  export type RouteMeta = pumped.RouteMeta
  export type CommandMeta = pumped.CommandMeta
  export type WorkflowRunMeta = pumped.WorkflowRunMeta
  export type JobRunMeta = pumped.JobRunMeta
  export type Manifest = pumped.Manifest
  export type ManifestIdentity = pumped.ManifestIdentity
  export type ManifestEntry = pumped.ManifestEntry
  export type ManifestGenerationOptions = pumped.ManifestGenerationOptions
  export type ManifestAgentMeta = pumped.ManifestAgentMeta
  export type Config = pumped.Config
  export type Options = pumped.Options
  export type JobsIo = pumped.JobsIo
  export type JobsRunner = pumped.JobsRunner
  export type WorkflowsIo = pumped.WorkflowsIo
  export type WorkflowsRunner = pumped.WorkflowsRunner
  export type GraphNode = pumped.GraphNode
  export type GraphEdge = pumped.GraphEdge
  export type GraphUnknown = pumped.GraphUnknown
  export type GraphReport = pumped.GraphReport
}

export { route, command, workflowRun, jobRun }
export { app }
export { analyze }
export type { GraphNode, GraphNodeKind, GraphEdge, GraphEdgeKind, GraphUnknown, GraphReport } from "./analyze"
export { createServer, createAppScope, runCli, runJobs, runWorkflows }
export type { AppDescriptor, EntryDescriptor, EntryKind } from "./discover"
export { discover } from "./discover"
export { generateManifest } from "./codegen"
export type { ManifestGenerationOptions } from "./codegen"
export type { ManifestIdentity } from "./runtime/manifest"
export { normalizeAgentEntry } from "./runtime/agent"
