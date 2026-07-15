import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import * as z from "zod"
import { abortSignal, type ModelRequest, type ModelResponse } from "../src/index.js"
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
  it("resolves only lawful role tools and leaves excluded tools without a usable permit", async () => {
    const effects: string[] = []
    const advertised: string[][] = []
    const schema = z.object({ value: z.string() })
    const allowed = agent.tool({
      name: "allowed",
      version: "1",
      description: "Allowed.",
      input: schema,
      flow: flow({
        name: "safety.allowed",
        parse: typed<{ value: string }>(),
        factory: (ctx) => { effects.push("allowed"); return ctx.input.value },
      }),
    })
    const forbidden = agent.tool({
      name: "forbidden",
      version: "1",
      description: "Forbidden.",
      input: schema,
      flow: flow({
        name: "safety.forbidden",
        parse: typed<{ value: string }>(),
        factory: (ctx) => { effects.push("forbidden"); return ctx.input.value },
      }),
    })
    const target = agent.role({ name: "narrow", version: "1", tools: { allowed, forbidden } })
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
      agent.attempt(agent.fromModel(model)),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const resolved = await ctx.resolve(target)
    const excluded = await ctx.resolve(forbidden)

    expect(resolved.tools.map((tool) => tool.snapshot.name)).toEqual(["allowed"])
    expect(() => runtime.tools.authorize(
      excluded.snapshot.identity,
      excluded.snapshot.permitEpoch,
      excluded.snapshot.authorityFingerprint,
    )).toThrow("not authorized")
    await expect(ctx.exec({
      flow: agent.turn({ name: "safety.narrow-turn", role: target }),
      input: { prompt: "Try the forbidden tool." },
    })).rejects.toThrow('Agent tool "forbidden" not found')
    expect(advertised).toEqual([["allowed"]])
    expect(effects).toEqual([])

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
      agent.attempt(agent.fromModel(model)),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const stream = ctx.execStream({
      flow: agent.turn({ name: "safety.abandoned-turn", role: agent.role({ name: "abandoned", version: "1" }) }),
      input: { prompt: "Stop before the model." },
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
    const guide = agent.skill({
      name: "guide",
      version: "1",
      description: "Guide.",
      content: flow({ name: "safety.guide", factory: () => { effects++; return "guide" } }),
    })
    const inspect = agent.tool({
      name: "inspect",
      version: "1",
      description: "Inspect.",
      input: z.object({}),
      flow: flow({ name: "safety.inspect", factory: () => { effects++; return "inspected" } }),
    })
    const childRole = agent.role({ name: "child", version: "1" })
    const child = agent.subagent({
      name: "child",
      version: "1",
      description: "Child.",
      role: childRole,
      turn: flow({
        name: "safety.child-turn",
        parse: typed<agent.TurnInput>(),
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
      }),
    })
    const target = agent.role({
      name: "safe-points",
      version: "1",
      tools: { inspect },
      skills: { guide },
      subagents: { child },
    })
    const attempt: agent.Attempt = flow({
      name: `safety.${kind}-attempt`,
      parse: typed<ModelRequest>(),
      factory: (): ModelResponse => {
        if (kind === "model") effects++
        if (kind === "skill") return { content: "", skillCalls: [{ name: "guide" }], stop: true }
        if (kind === "tool") return { content: "", toolCalls: [{ name: "inspect", input: {} }], stop: true }
        if (kind === "subagent") return { content: "", subagentCalls: [{ name: "child", input: {} }], stop: true }
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
      agent.attempt(attempt),
      abortSignal(controller.signal),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const stream = ctx.execStream({
      flow: agent.turn({ name: `safety.${kind}-turn`, role: target }),
      input: { prompt: "Cancel at the safe point." },
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
