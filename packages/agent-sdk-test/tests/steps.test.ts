import { describe, expect, it } from "vitest"
import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import {
  abortSignal,
  workflowRun,
  step,
  SuspendSignal,
  workflow as workflowRuntime,
} from "@pumped-fn/agent-sdk"
import {
  MemoryWorkflowLog,
  agent,
} from "../src/index"

describe("workflow steps", () => {
  it("memoizes completed workflow execution", async () => {
    const { extensions } = agent()
    const scope = createScope({ extensions })
    await scope.ready
    let calls = 0
    const worker = flow({
      name: "memo-worker",
      parse: typed<number>(),
      tags: [step({ workflow: true })],
      factory: (ctx) => {
        calls++
        return ctx.input * 2
      },
    })
    const root = flow({
      name: "memo-root",
      parse: typed<number>(),
      tags: [step({ workflow: true })],
      deps: { workflow: tags.required(workflowRuntime) },
      factory: async (ctx, { workflow }) => {
        expect(workflow.taskId).toBe("task-a")
        return ctx.exec({ flow: worker, input: ctx.input })
      },
    })

    const ctx1 = scope.createContext({ tags: [workflowRun({ taskId: "task-a", runId: "run-a" })] })
    expect(await ctx1.exec({ flow: root, input: 3 })).toBe(6)
    await ctx1.close()

    const ctx2 = scope.createContext({ tags: [workflowRun({ taskId: "task-a", runId: "run-a" })] })
    expect(await ctx2.exec({ flow: root, input: 3 })).toBe(6)
    await ctx2.close()

    expect(calls).toBe(1)
  })

  it("replays completed flow before resolving deps", async () => {
    const gate = tag<string>({ label: "agent.replay.gate" })
    const { extensions } = agent()
    const scope = createScope({ extensions })
    await scope.ready
    let calls = 0
    const worker = flow({
      name: "replay-before-deps",
      tags: [step({ workflow: true })],
      deps: { gate: tags.required(gate) },
      factory: (_ctx, { gate }) => {
        calls++
        return `ok:${gate}`
      },
    })

    const ctx1 = scope.createContext({
      tags: [workflowRun({ taskId: "task-replay-deps", runId: "run-replay-deps" }), gate("first")],
    })
    expect(await ctx1.exec({ flow: worker })).toBe("ok:first")
    await ctx1.close()

    const ctx2 = scope.createContext({ tags: [workflowRun({ taskId: "task-replay-deps", runId: "run-replay-deps" })] })
    expect(await ctx2.exec({ flow: worker })).toBe("ok:first")
    await ctx2.close()
    expect(calls).toBe(1)
  })

  it("suspends durable work and replays memoized steps on resolution", async () => {
    const log = new MemoryWorkflowLog()
    const { extensions } = agent({ log })
    const scope = createScope({ extensions })
    await scope.ready
    let expensiveCalls = 0
    const expensive = flow({
      name: "expensive",
      tags: [step({ workflow: true })],
      factory: () => {
        expensiveCalls++
        return "ready"
      },
    })
    const approve = flow({
      name: "approve",
      tags: [step({ durable: true })],
      factory: () => "unreachable",
    })
    const root = flow({
      name: "approval-root",
      tags: [step({ workflow: true })],
      factory: async (ctx) => {
        const first = await ctx.exec({ flow: expensive })
        const decision = await ctx.exec({ flow: approve })
        return `${first}:${decision}`
      },
    })

    const ctx1 = scope.createContext({ tags: [workflowRun({ taskId: "task-b", runId: "run-b" })] })
    await expect(ctx1.exec({ flow: root })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx1.close({ ok: false, error: new Error("suspended") })

    const pending = log.entries().find((entry) => entry.status === "pending")
    expect(pending?.targetName).toBe("approve")
    if (!pending) throw new Error("approve step did not suspend")
    await log.resolve(pending.key, "yes")

    const ctx2 = scope.createContext({ tags: [workflowRun({ taskId: "task-b", runId: "run-b" })] })
    expect(await ctx2.exec({ flow: root })).toBe("ready:yes")
    await ctx2.close()
    expect(expensiveCalls).toBe(1)
  })

  it("suspends durable work before resolving deps", async () => {
    const gate = tag<string>({ label: "agent.durable.gate" })
    const { extensions } = agent()
    const scope = createScope({ extensions })
    await scope.ready
    const approve = flow({
      name: "durable-before-deps",
      deps: { gate: tags.required(gate) },
      factory: (_ctx, { gate }) => gate,
    })

    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-durable-deps", runId: "run-durable-deps" })] })
    await expect(ctx.exec({ flow: approve, tags: [step({ durable: true })] })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx.close({ ok: false, error: new Error("suspended") })
  })

  it("aborts timed workflow steps cooperatively", async () => {
    const { extensions } = agent()
    const scope = createScope({ extensions })
    await scope.ready
    let aborted = false
    const timed = flow({
      name: "timed-abort",
      tags: [step({ workflow: true, timeoutMs: 5 })],
      deps: { signal: tags.required(abortSignal) },
      factory: (_ctx, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true
          reject(signal.reason)
        }, { once: true })
      }),
    })

    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-timeout", runId: "run-timeout" })] })
    await expect(ctx.exec({ flow: timed })).rejects.toThrow("Workflow step timed out after 5ms")
    expect(aborted).toBe(true)
    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })
})
