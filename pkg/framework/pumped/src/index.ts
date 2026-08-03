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
  export type RouteMeta = import("./tags").RouteMeta
  export type CommandMeta = import("./tags").CommandMeta
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
  export type GraphNode = import("./analyze").GraphNode
  export type GraphEdge = import("./analyze").GraphEdge
  export type GraphUnknown = import("./analyze").GraphUnknown
  export type GraphReport = import("./analyze").GraphReport
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
export { normalizeAgentEntry } from "./runtime/agent"
