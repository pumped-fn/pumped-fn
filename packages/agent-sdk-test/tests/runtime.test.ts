import { describe, expect, it } from "vitest"
import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import {
  workflowRun,
  step,
  workflow as workflowRuntime,
  workflowExtension,
} from "@pumped-fn/agent-sdk"
import { MemoryWorkflowLog } from "../src/index"

describe("agent runtime tags", () => {
  it("memoizes workflow runtime tag with workflow extension", async () => {
    const log = new MemoryWorkflowLog()
    const extension = workflowExtension({ log })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    let calls = 0
    const root = flow({
      name: "workflow-root",
      parse: typed<number>(),
      tags: [step({ workflow: true })],
      deps: { workflow: tags.required(workflowRuntime) },
      factory: (ctx, { workflow }) => {
        calls++
        return `${workflow.taskId}:${workflow.runId}:${ctx.input}`
      },
    })

    const ctx1 = scope.createContext({ tags: [workflowRun({ taskId: "workflow-task", runId: "workflow-run" })] })
    expect(await ctx1.exec({ flow: root, input: 1 })).toBe("workflow-task:workflow-run:1")
    await ctx1.close()

    const ctx2 = scope.createContext({ tags: [workflowRun({ taskId: "workflow-task", runId: "workflow-run" })] })
    expect(await ctx2.exec({ flow: root, input: 2 })).toBe("workflow-task:workflow-run:1")
    await ctx2.close()
    expect(calls).toBe(1)
  })

  it("rejects workflow dependency without workflow extension", async () => {
    const root = flow({
      name: "unguarded-workflow",
      tags: [step({ workflow: true })],
      deps: { workflow: tags.required(workflowRuntime) },
      factory: (_ctx, { workflow }) => workflow.taskId,
    })
    const scope = createScope()
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "workflow-missing-extension", runId: "run" })] })
    await expect(ctx.exec({ flow: root })).rejects.toThrow('Tag "workflow.runtime" not found')
    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })

  it("provides workflow runtime deps without workflow memoization", async () => {
    const log = new MemoryWorkflowLog()
    const extension = workflowExtension({ log })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    let calls = 0
    const root = flow({
      name: "workflow-runtime-only",
      parse: typed<number>(),
      deps: { workflow: tags.required(workflowRuntime) },
      factory: (ctx, { workflow }) => {
        calls++
        return `${workflow.taskId}:${ctx.input}`
      },
    })

    const ctx1 = scope.createContext({ tags: [workflowRun({ taskId: "runtime-task", runId: "runtime-run" })] })
    expect(await ctx1.exec({ flow: root, input: 1 })).toBe("runtime-task:1")
    await ctx1.close()

    const ctx2 = scope.createContext({ tags: [workflowRun({ taskId: "runtime-task", runId: "runtime-run" })] })
    expect(await ctx2.exec({ flow: root, input: 2 })).toBe("runtime-task:2")
    await ctx2.close()
    expect(calls).toBe(2)
  })
})
