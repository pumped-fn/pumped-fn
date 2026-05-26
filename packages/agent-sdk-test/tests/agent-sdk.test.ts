import { describe, expect, it } from "vitest"
import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import {
  CliWorkerError,
  SuspendSignal,
  claudeCliWorker,
  cliWorker,
  codexCliWorker,
  delegate,
  derivedMaterial,
  material,
  patchMaterial,
  run,
  step,
  workerRegistry,
} from "@pumped-fn/agent-sdk"
import { replay, run as replayRun, suspend } from "@pumped-fn/lite-extension-suspense"
import {
  InMemoryAgentEventLog,
  InMemorySuspenseEventLog,
  agent,
  suspense,
} from "../src/index"

describe("agent sdk", () => {
  it("replays standalone suspense steps without agent config", async () => {
    const log = new InMemorySuspenseEventLog()
    const { extension } = suspense({ log })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    let calls = 0
    const step = flow({
      name: "standalone-step",
      parse: typed<number>(),
      tags: [replay(true)],
      factory: (ctx) => {
        calls++
        return ctx.input + 1
      },
    })

    const ctx1 = scope.createContext(replayRun({ taskId: "sync-a", runId: "run-a" }))
    expect(await ctx1.exec({ flow: step, input: 1 })).toBe(2)
    await ctx1.close()

    const ctx2 = scope.createContext(replayRun({ taskId: "sync-a", runId: "run-a" }))
    expect(await ctx2.exec({ flow: step, input: 100 })).toBe(2)
    await ctx2.close()
    expect(calls).toBe(1)
  })

  it("suspends standalone suspense steps and resumes from resolved value", async () => {
    const log = new InMemorySuspenseEventLog()
    const { extension } = suspense({ log })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    const externalSync = flow({
      name: "external-sync",
      tags: [suspend(true)],
      factory: () => "unreachable",
    })

    const ctx1 = scope.createContext(replayRun({ taskId: "sync-b", runId: "run-b" }))
    await expect(ctx1.exec({ flow: externalSync })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx1.close({ ok: false, error: new Error("suspended") })

    const pending = log.entries().find((entry) => entry.status === "pending")
    expect(pending?.targetName).toBe("external-sync")
    if (!pending) throw new Error("external-sync step did not suspend")
    await log.resolve(pending.key, "synced")

    const ctx2 = scope.createContext(replayRun({ taskId: "sync-b", runId: "run-b" }))
    expect(await ctx2.exec({ flow: externalSync })).toBe("synced")
    await ctx2.close()
  })

  it("memoizes completed workflow execution", async () => {
    const { extension } = agent()
    const scope = createScope({ extensions: [extension] })
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
      factory: async (ctx) => ctx.exec({ flow: worker, input: ctx.input }),
    })

    const ctx1 = scope.createContext(run({ taskId: "task-a", runId: "run-a" }))
    expect(await ctx1.exec({ flow: root, input: 3 })).toBe(6)
    await ctx1.close()

    const ctx2 = scope.createContext(run({ taskId: "task-a", runId: "run-a" }))
    expect(await ctx2.exec({ flow: root, input: 3 })).toBe(6)
    await ctx2.close()

    expect(calls).toBe(1)
  })

  it("replays completed flow before resolving deps", async () => {
    const gate = tag<string>({ label: "agent.replay.gate" })
    const { extension } = agent()
    const scope = createScope({ extensions: [extension] })
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

    const ctx1 = scope.createContext(run({
      taskId: "task-replay-deps",
      runId: "run-replay-deps",
      tags: [gate("first")],
    }))
    expect(await ctx1.exec({ flow: worker })).toBe("ok:first")
    await ctx1.close()

    const ctx2 = scope.createContext(run({ taskId: "task-replay-deps", runId: "run-replay-deps" }))
    expect(await ctx2.exec({ flow: worker })).toBe("ok:first")
    await ctx2.close()
    expect(calls).toBe(1)
  })

  it("suspends durable work and replays memoized steps on resolution", async () => {
    const log = new InMemoryAgentEventLog()
    const { extension } = agent({ log })
    const scope = createScope({ extensions: [extension] })
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

    const ctx1 = scope.createContext(run({ taskId: "task-b", runId: "run-b" }))
    await expect(ctx1.exec({ flow: root })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx1.close({ ok: false, error: new Error("suspended") })

    const pending = log.entries().find((entry) => entry.status === "pending")
    expect(pending?.targetName).toBe("approve")
    if (!pending) throw new Error("approve step did not suspend")
    await log.resolve(pending.key, "yes")

    const ctx2 = scope.createContext(run({ taskId: "task-b", runId: "run-b" }))
    expect(await ctx2.exec({ flow: root })).toBe("ready:yes")
    await ctx2.close()
    expect(expensiveCalls).toBe(1)
  })

  it("suspends durable work before resolving deps", async () => {
    const gate = tag<string>({ label: "agent.durable.gate" })
    const { extension } = agent()
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    const approve = flow({
      name: "durable-before-deps",
      deps: { gate: tags.required(gate) },
      factory: (_ctx, { gate }) => gate,
    })

    const ctx = scope.createContext(run({ taskId: "task-durable-deps", runId: "run-durable-deps" }))
    await expect(ctx.exec({ flow: approve, tags: [step({ durable: true })] })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx.close({ ok: false, error: new Error("suspended") })
  })

  it("delegates by worker registry and routes remote workers", async () => {
    const { extension } = agent()
    const scope = createScope({ extensions: [extension] })
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
      tags: [step({ workflow: true })],
      factory: (ctx) => delegate<string, { text: string }>(ctx, "upper", ctx.input),
    })
    const ctx = scope.createContext(run({ taskId: "task-c", runId: "run-c", registry }))
    expect(await ctx.exec({ flow: root, input: { text: "works" } })).toBe("WORKS")
    await ctx.close()
  })

  it("routes remote work before resolving deps when runner handles it", async () => {
    const gate = tag<string>({ label: "agent.remote.gate" })
    const { extension } = agent({
      remoteRunner: {
        run: async (event) => {
          expect(event.targetName).toBe("remote-before-deps")
          return "remote-only"
        },
      },
    })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    const worker = flow({
      name: "remote-before-deps",
      deps: { gate: tags.required(gate) },
      factory: (_ctx, { gate }) => gate,
    })

    const ctx = scope.createContext(run({ taskId: "task-remote-deps", runId: "run-remote-deps" }))
    expect(await ctx.exec({ flow: worker, tags: [step({ remote: true })] })).toBe("remote-only")
    await ctx.close()
  })

  it("patches JSON materials with revision conflicts", async () => {
    const scope = createScope()
    const ctx = scope.createContext(run({ taskId: "task-d", runId: "run-d" }))
    const prStatus = material("pr-status", {
      kind: "json",
      initialState: { prs: {} as Record<string, { status: string }> },
    })

    const next = await patchMaterial(ctx, prStatus, [
      { op: "add", path: "/prs/12", value: { status: "ok" } },
    ])
    expect(next).toEqual({
      name: "pr-status",
      kind: "json",
      revision: 1,
      state: { prs: { "12": { status: "ok" } } },
    })
    await expect(
      patchMaterial(ctx, prStatus, [
        { op: "replace", path: "/prs/12/status", value: "stale" },
      ], { expectedRevision: 0 })
    ).rejects.toThrow("Material revision conflict")
    await ctx.close()
  })

  it("derives material state from primary material", async () => {
    const source = material("count", {
      kind: "json",
      initialState: { value: 2 },
    })
    const doubled = derivedMaterial("double", source, (state) => state.value * 2, { kind: "json" })
    const scope = createScope()
    expect(await scope.resolve(doubled)).toEqual({
      name: "double",
      kind: "json",
      revision: 0,
      state: 4,
    })
  })

  it("runs a real CLI worker", async () => {
    const cli = cliWorker<{ text: string }, string>({
      name: "printf",
      command: "printf",
      args: (input) => ["%s", input.text],
      timeoutMs: 5_000,
    })
    const scope = createScope()
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: cli, input: { text: "agent-sdk-cli-ok" } })).toBe("agent-sdk-cli-ok")
    await ctx.close()
  })

  it("marks CLI-backed LLM helpers as LLM workers", () => {
    expect(step.find(cliWorker({ name: "x", command: "printf" })).kind).toBe("cli")
    expect(step.find(claudeCliWorker()).kind).toBe("llm")
    expect(step.find(codexCliWorker()).kind).toBe("llm")
  })

  it("reports CLI failures with captured stderr", async () => {
    const cli = cliWorker({
      name: "sh-fail",
      command: "sh",
      args: ["-c", "echo bad >&2; exit 7"],
    })
    const scope = createScope()
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: cli, input: { prompt: "" } })).rejects.toMatchObject({
      name: "CliWorkerError",
      result: { exitCode: 7, stderr: "bad\n" },
    } satisfies Partial<CliWorkerError>)
    await ctx.close({ ok: false, error: new Error("expected") })
  })
})
