import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import {
  SuspendSignal,
  agent as agentRuntime,
  workflowRun,
  step,
  workflow as workflowRuntime,
  workerRegistry,
  workers,
  type WorkflowStepEntry,
} from "@pumped-fn/agent-sdk"
import {
  MemoryWorkflowLog,
  agent as testAgent,
} from "../src/index"

export interface DevRequest {
  ticket: string
  request: string
}

export interface Patch {
  files: readonly string[]
  summary: string
}

export interface TestReport {
  passed: boolean
  command: string
  output: string
}

export interface DevResult {
  taskId: string
  runId: string
  ticket: string
  patch: Patch
  tests: TestReport
  approval: string
  status: "ready-to-merge"
}

export interface DevRun {
  result: DevResult
  suspended: boolean
  calls: {
    implement: number
    test: number
  }
  entries: WorkflowStepEntry[]
}

export async function runDevWorkflow(
  request: DevRequest = {
    ticket: "FEAT-42",
    request: "Add audit trail to project settings",
  },
  options: {
    taskId?: string
    runId?: string
    approval?: string
  } = {}
): Promise<DevRun> {
  const calls = { implement: 0, test: 0 }
  const taskId = options.taskId ?? `dev-${request.ticket}`
  const runId = options.runId ?? "run-1"

  const implementFeature = flow({
    name: "implement-feature",
    parse: typed<DevRequest>(),
    tags: [step({ workflow: true, remote: true, kind: "code" })],
    factory: (ctx): Patch => {
      calls.implement++
      return {
        files: ["src/features/audit-trail.ts", "tests/audit-trail.test.ts"],
        summary: `${ctx.input.ticket}: ${ctx.input.request}`,
      }
    },
  })

  const runFeatureTests = flow({
    name: "run-feature-tests",
    parse: typed<{ patch: Patch }>(),
    tags: [step({ workflow: true, kind: "cli" })],
    factory: (ctx): TestReport => {
      calls.test++
      return {
        passed: true,
        command: "pnpm test -- audit-trail",
        output: `validated ${ctx.input.patch.files.length} files`,
      }
    },
  })

  const waitForProductReview = flow<string>({
    name: "await-product-review",
    tags: [step({ durable: true, kind: "review" })],
    factory: () => {
      throw new Error("await-product-review should suspend before factory runs")
    },
  })

  const developFeature = flow({
    name: "develop-feature",
    parse: typed<DevRequest>(),
    tags: [
      step({ workflow: true }),
      workers(workerRegistry([implementFeature])),
    ],
    deps: {
      workflow: tags.required(workflowRuntime),
      agent: tags.required(agentRuntime),
    },
    factory: async (ctx, { workflow, agent }): Promise<DevResult> => {
      const patch = await agent.delegate<Patch, DevRequest>("implement-feature", ctx.input)
      const tests = await ctx.exec({ flow: runFeatureTests, input: { patch } })
      const approval = await ctx.exec({ flow: waitForProductReview })
      return {
        taskId: workflow.taskId,
        runId: workflow.runId,
        ticket: ctx.input.ticket,
        patch,
        tests,
        approval,
        status: "ready-to-merge",
      }
    },
  })

  const log = new MemoryWorkflowLog()
  const { extensions } = testAgent({ log })
  const scope = createScope({ extensions })
  await scope.ready

  let suspended = false
  const firstCtx = scope.createContext({ tags: [workflowRun({ taskId, runId })] })
  try {
    await firstCtx.exec({ flow: developFeature, input: request })
    await firstCtx.close()
  } catch (error) {
    await firstCtx.close({ ok: false, error })
    if (!(error instanceof SuspendSignal)) throw error
    suspended = true
  }

  const pending = log.entries().find((entry) =>
    entry.status === "pending" && entry.targetName === "await-product-review"
  )
  if (!pending) throw new Error("development workflow did not wait for product review")
  await log.resolve(pending.key, options.approval ?? "product-approved")

  const secondCtx = scope.createContext({ tags: [workflowRun({ taskId, runId })] })
  const result = await secondCtx.exec({ flow: developFeature, input: request })
  await secondCtx.close()
  await scope.dispose()

  return {
    result,
    suspended,
    calls,
    entries: log.entries(),
  }
}
