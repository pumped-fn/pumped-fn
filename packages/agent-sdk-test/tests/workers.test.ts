import { describe, expect, it } from "vitest"
import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import {
  agent as agentRuntime,
  extension as agentExtension,
  workflowRun,
  step,
  workers,
  workflowExtension,
  workerRegistry,
} from "@pumped-fn/agent-sdk"
import {
  MemoryWorkflowLog,
  agent,
} from "../src/index"

describe("worker delegation", () => {
  it("delegates by worker registry and routes remote workers", async () => {
    const { extensions } = agent()
    const scope = createScope({ extensions })
    await scope.ready
    const worker = flow({
      name: "upper",
      parse: typed<{ text: string }>(),
      tags: [step({ remote: true, kind: "code" })],
      factory: (ctx) => ctx.input.text.toUpperCase(),
    })
    const registry = workerRegistry([worker])
    const root = flow({
      name: "delegate-root",
      parse: typed<{ text: string }>(),
      tags: [step({ workflow: true }), workers(registry)],
      deps: { agent: tags.required(agentRuntime) },
      factory: (ctx, { agent }) => agent.delegate<string, { text: string }>("upper", ctx.input),
    })
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-c", runId: "run-c" })] })
    expect(await ctx.exec({ flow: root, input: { text: "works" } })).toBe("WORKS")
    await ctx.close()
  })

  it("delegates by worker registry tag", async () => {
    const { extensions } = agent()
    const scope = createScope({ extensions })
    await scope.ready
    const worker = flow({
      name: "reverse",
      parse: typed<{ text: string }>(),
      factory: (ctx) => ctx.input.text.split("").reverse().join(""),
    })
    const registry = workerRegistry([worker])
    const root = flow({
      name: "delegate-root-tag",
      parse: typed<{ text: string }>(),
      tags: [step({ workflow: true })],
      deps: { agent: tags.required(agentRuntime) },
      factory: (ctx, { agent }) => agent.delegate<string, { text: string }>("reverse", ctx.input),
    })
    const ctx = scope.createContext({
      tags: [workflowRun({ taskId: "task-c-tag", runId: "run-c-tag" }), workers(registry)],
    })
    expect(await ctx.exec({ flow: root, input: { text: "works" } })).toBe("skrow")
    await ctx.close()
  })

  it("rejects agent dependency without agent extension", async () => {
    const worker = flow({
      name: "unguarded-worker",
      parse: typed<{ text: string }>(),
      factory: (ctx) => ctx.input.text,
    })
    const root = flow({
      name: "unguarded-root",
      parse: typed<{ text: string }>(),
      tags: [step({ workflow: true }), workers(workerRegistry([worker]))],
      deps: { agent: tags.required(agentRuntime) },
      factory: (ctx, { agent }) => agent.delegate<string, { text: string }>("unguarded-worker", ctx.input),
    })
    const scope = createScope({ extensions: [workflowExtension({ log: new MemoryWorkflowLog() })] })
    await scope.ready
    const ctx = scope.createContext({
      tags: [workflowRun({ taskId: "task-missing-extension", runId: "run-missing-extension" })],
    })
    await expect(ctx.exec({ flow: root, input: { text: "unsafe" } }))
      .rejects.toThrow('Tag "agent.runtime" not found')
    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })

  it("rejects agent extension without workflow extension", async () => {
    const scope = createScope({ extensions: [agentExtension({ remoteRunner: { run: (_event, next) => next() } })] })
    await scope.ready
    const root = flow({
      name: "agent-without-workflow",
      tags: [step({ workflow: true })],
      deps: { agent: tags.required(agentRuntime) },
      factory: (_ctx, { agent }) => agent.taskId,
    })

    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-agent-only", runId: "run-agent-only" })] })
    await expect(ctx.exec({ flow: root })).rejects.toThrow("agent extension requires workflow extension")
    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })

  it("rejects remote steps when no remote runner is configured", async () => {
    const log = new MemoryWorkflowLog()
    const scope = createScope({ extensions: [workflowExtension({ log }), agentExtension()] })
    await scope.ready
    const worker = flow({
      name: "missing-remote-runner",
      tags: [step({ remote: true })],
      factory: () => "local",
    })

    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-missing-remote", runId: "run-missing-remote" })] })
    await expect(ctx.exec({ flow: worker })).rejects.toThrow("Remote step requires remoteRunner")
    await ctx.close({ ok: false, error: new Error("expected") })
  })

  it("routes remote work before resolving deps when runner handles it", async () => {
    const gate = tag<string>({ label: "agent.remote.gate" })
    const { extensions } = agent({
      remoteRunner: {
        run: async (event) => {
          expect(event.targetName).toBe("remote-before-deps")
          return "remote-only"
        },
      },
    })
    const scope = createScope({ extensions })
    await scope.ready
    const worker = flow({
      name: "remote-before-deps",
      deps: { gate: tags.required(gate) },
      factory: (_ctx, { gate }) => gate,
    })

    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-remote-deps", runId: "run-remote-deps" })] })
    expect(await ctx.exec({ flow: worker, tags: [step({ remote: true })] })).toBe("remote-only")
    await ctx.close()
  })
})
