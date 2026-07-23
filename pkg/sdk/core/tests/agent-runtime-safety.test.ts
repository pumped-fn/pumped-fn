import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import * as z from "zod"
import { model as modelImpl, type ModelRequest, type ModelResponse } from "../src/index.js"
import * as agent from "../src/agent.js"
import * as session from "../src/session.js"
import * as validation from "../src/validation.js"

function initial(authority: session.Authority): session.SessionRecord {
  return Object.freeze({
    id: "agent-runtime-safety",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: Object.freeze([{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: authority.fingerprint,
      authority,
      evidence: Object.freeze([]),
    }]),
    work: Object.freeze([]),
    attempts: Object.freeze([]),
    invocations: Object.freeze([]),
    artifacts: Object.freeze([]),
    memory: Object.freeze([]),
    schedules: Object.freeze([]),
    providerContinuations: Object.freeze({}),
    nextEventSequence: 1,
  })
}

function authority(tools: readonly string[] = []): session.Authority {
  return session.createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: [],
    tools,
    sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
  })
}

const engine = validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (schema) => z.toJSONSchema(schema) })

describe("agent runtime safety", () => {
  it("refines the safe observation projection only for the selected tool", async () => {
    const observed: { name: string; projection: session.ObservationProjection | undefined }[] = []
    const schema = z.object({})
    const inspect = flow({
      name: "inspect",
      tags: [agent.config.tool({ version: "1", description: "Inspect.", input: schema })],
      deps: { projection: tags.required(session.observation.current) },
      factory: (_ctx, { projection }) => projection,
    })
    const model = flow({
      name: "safety.observation-model",
      parse: typed<ModelRequest>(),
      factory: (): ModelResponse => ({
        content: "",
        toolCalls: [{ name: "inspect", input: {} }],
        stop: true,
      }),
    })
    const granted = authority(["inspect"])
    const scope = createScope({
      tags: [
        session.authority(granted),
        session.record(initial(granted)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        validation.engine(engine),
        agent.config.role({ name: "observer", version: "1" }),
        agent.impl.tool(inspect),
        agent.impl.attempt(agent.fromModel),
        modelImpl(model),
        session.execution.turn({ flow: agent.turn }),
      ],
      extensions: [{
        name: "observation-recorder",
        async wrapExec(next, target, child) {
          observed.push({
            name: target.name ?? "",
            projection: child.data.seekTag(session.observation.current),
          })
          return next()
        },
      }],
    })
    const ctx = scope.createContext()

    const result = await ctx.exec({
      flow: session.run,
      tags: [session.observation.channel("github")],
      input: {
        work: { id: "observed", branchId: "main", role: "observer", policy: "all" },
        input: { prompt: "Inspect." },
      },
    })

    expect(result.toolResults[0]?.output).toEqual({
      sessionId: "agent-runtime-safety",
      activationId: "agent-runtime-safety:observed:1",
      workId: "observed",
      channel: "github",
      role: "observer",
      tool: "inspect",
    })
    expect(observed.find(({ name }) => name === "agent.turn")?.projection).toEqual({
      sessionId: "agent-runtime-safety",
      activationId: "agent-runtime-safety:observed:1",
      workId: "observed",
      channel: "github",
      role: "observer",
    })
    expect(observed.find(({ name }) => name === "inspect")?.projection).toEqual({
      sessionId: "agent-runtime-safety",
      activationId: "agent-runtime-safety:observed:1",
      workId: "observed",
      channel: "github",
      role: "observer",
      tool: "inspect",
    })

    await ctx.close()
    await scope.dispose()
  })

  it("resolves only lawful role tools and leaves excluded tools without a usable permit", async () => {
    const effects: string[] = []
    const advertised: string[][] = []
    const schema = z.object({ value: z.string() })
    const allowed = flow({
      name: "allowed",
      tags: [agent.config.tool({ version: "1", description: "Allowed.", input: schema })],
      parse: typed<{ value: string }>(),
      factory: (ctx) => { effects.push("allowed"); return ctx.input.value },
    })
    const forbidden = flow({
      name: "forbidden",
      tags: [agent.config.tool({ version: "1", description: "Forbidden.", input: schema })],
      parse: typed<{ value: string }>(),
      factory: (ctx) => { effects.push("forbidden"); return ctx.input.value },
    })
    const model = flow({
      name: "safety.forbidden-model",
      parse: typed<ModelRequest>(),
      factory: (ctx): ModelResponse => {
        advertised.push(ctx.input.tools.map((tool) => tool.name))
        return { content: "", toolCalls: [{ name: "forbidden", input: { value: "blocked" } }], stop: true }
      },
    })
    const granted = authority(["allowed"])
    const scope = createScope({ tags: [
      session.authority(granted),
      session.record(initial(granted)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(engine),
      agent.config.role({ name: "narrow", version: "1" }),
      agent.impl.tool(allowed),
      agent.impl.tool(forbidden),
      agent.impl.attempt(agent.fromModel),
      modelImpl(model),
      session.execution.turn({ flow: agent.turn }),
    ] })
    const ctx = scope.createContext()
    const resolved = await ctx.resolve(agent.role)

    expect(resolved.tools.map((tool) => tool.snapshot.name)).toEqual(["allowed"])
    await expect(ctx.exec({
      flow: session.run,
      input: {
        work: { id: "narrow", branchId: "main", role: "narrow", policy: "all" },
        input: { prompt: "Try the forbidden tool." },
      },
    })).rejects.toThrow('Agent tool "forbidden" not found')
    expect(advertised).toEqual([["allowed"]])
    expect(effects).toEqual([])

    await ctx.close()
    await scope.dispose()
  })

  it("serializes cyclic arrays returned by tools", async () => {
    const cycle: unknown[] = []
    cycle.push(cycle)
    const shared = ["shared"]
    const output = { cycle, left: shared, right: shared }
    let calls = 0
    let toolMessage: string | undefined
    const inspect = flow({
      name: "cyclic-array",
      tags: [agent.config.tool({ version: "1", description: "Return a cyclic array.", input: z.object({}) })],
      factory: () => output,
    })
    const model = flow({
      name: "safety.cyclic-array-model",
      parse: typed<ModelRequest>(),
      factory: (ctx): ModelResponse => {
        if (calls++ === 0) return { content: "", toolCalls: [{ name: "cyclic-array", input: {} }] }
        toolMessage = ctx.input.messages.find((message) => message.role === "tool")?.content
        return { content: "done", stop: true }
      },
    })
    const granted = authority(["cyclic-array"])
    const scope = createScope({ tags: [
      session.authority(granted),
      session.record(initial(granted)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(engine),
      agent.config.role({ name: "cyclic-array", version: "1" }),
      agent.impl.tool(inspect),
      agent.impl.attempt(agent.fromModel),
      modelImpl(model),
      session.execution.turn({ flow: agent.turn }),
    ] })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: session.run,
      input: {
        work: { id: "cyclic-array", branchId: "main", role: "cyclic-array", policy: "all" },
        input: { prompt: "Inspect." },
      },
    })).resolves.toMatchObject({ content: "done" })
    expect(toolMessage).toBe('{"cycle":["[Circular]"],"left":["shared"],"right":["shared"]}')

    await ctx.close()
    await scope.dispose()
  })

  it("settles a direct turn invocation when its stream consumer returns", async () => {
    let modelCalls = 0
    const model = flow({
      name: "safety.abandoned-model",
      parse: typed<ModelRequest>(),
      factory: (): ModelResponse => { modelCalls++; return { content: "unused", stop: true } },
    })
    const granted = authority()
    const scope = createScope({ tags: [
      session.authority(granted),
      session.record(initial(granted)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(engine),
      agent.config.role({ name: "abandoned", version: "1" }),
      agent.impl.attempt(agent.fromModel),
      modelImpl(model),
      session.execution.turn({ flow: agent.turn }),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const stream = ctx.execStream({
      flow: session.run,
      input: {
        work: { id: "abandoned", branchId: "main", role: "abandoned", policy: "all" },
        input: { prompt: "Stop before the model." },
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    let event = await iterator.next()
    while (!event.done && event.value.type !== "agent_model_start") event = await iterator.next()
    expect(event.done).toBe(false)
    await iterator.return?.()

    expect(modelCalls).toBe(0)
    expect(runtime.record.invocations).toMatchObject([{ kind: "model", status: "cancelled" }])
    expect(runtime.record.invocations.some((value) => value.status === "working")).toBe(false)

    await ctx.close()
    await scope.dispose()
  })

  it.each([
    ["model", "agent_model_start"],
    ["skill", "agent_skill_start"],
    ["tool", "agent_tool_start"],
    ["subagent", "agent_subagent_start"],
  ] as const)("checks cancellation after the %s start event before its effect", async (kind, startEvent) => {
    let effects = 0
    const cancellation = tag<typeof kind>({ label: "test.cancellation.kind" })
    const guide = flow({
      name: "guide",
      tags: [agent.config.skill({ name: "guide", version: "1", description: "Guide." })],
      factory: () => { effects++; return "guide" },
    })
    const inspect = flow({
      name: "inspect",
      tags: [agent.config.tool({ version: "1", description: "Inspect.", input: z.object({}) })],
      factory: () => { effects++; return "inspected" },
    })
    const child = flow({
      name: "child",
      tags: [agent.config.subagent({ name: "child", version: "1", description: "Child." })],
      parse: typed<session.RunInput<agent.TurnInput>>(),
      factory: (): agent.TurnResult => {
        effects++
        return {
          role: "child",
          content: "child",
          messages: [],
          rounds: 0,
          toolResults: [],
          skillResults: [],
          subagentResults: [],
          events: [],
        }
      },
    })
    const attempt: agent.Attempt = flow({
      name: "safety.cancellation-attempt",
      parse: typed<ModelRequest>(),
      deps: { selectedKind: tags.required(cancellation) },
      factory: (_ctx, { selectedKind }): ModelResponse => {
        if (selectedKind === "model") effects++
        if (selectedKind === "skill") return { content: "", skillCalls: [{ name: "guide" }], stop: true }
        if (selectedKind === "tool") return { content: "", toolCalls: [{ name: "inspect", input: {} }], stop: true }
        if (selectedKind === "subagent") return { content: "", subagentCalls: [{ name: "child", input: {} }], stop: true }
        return { content: "done", stop: true }
      },
    })
    const granted = authority(["inspect"])
    const controller = new AbortController()
    const scope = createScope({ tags: [
      session.authority(granted),
      session.record(initial(granted)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(engine),
      agent.config.role({ name: "safe-points", version: "1" }),
      agent.impl.tool(inspect),
      agent.impl.skill(guide),
      agent.impl.subagent(child),
      agent.impl.attempt(attempt),
      cancellation(kind),
      session.execution.turn({ flow: agent.turn }),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const stream = ctx.execStream({
      flow: session.run,
      signal: controller.signal,
      input: {
        work: { id: `${kind}-work`, branchId: "main", role: "safe-points", policy: "all" },
        input: { prompt: "Cancel at the safe point." },
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    let event = await iterator.next()
    while (!event.done && event.value.type !== startEvent) event = await iterator.next()
    expect(event.done).toBe(false)
    controller.abort(new DOMException("cancelled", "AbortError"))

    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" })
    await expect(stream.result).rejects.toMatchObject({ name: "AbortError" })
    expect(effects).toBe(0)
    expect(runtime.record.invocations.at(-1)).toMatchObject({ kind, status: "cancelled" })
    expect(runtime.record.invocations.some((value) => value.status === "working")).toBe(false)

    await ctx.close()
    await scope.dispose()
  })
})
