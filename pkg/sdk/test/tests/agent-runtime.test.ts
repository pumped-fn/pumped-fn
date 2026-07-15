import { createScope, flow, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import { describe, expect, it } from "vitest"
import { attemptStub, kit } from "../src/index"

describe("SDK 3 agent runtime", () => {
  it("streams model events and returns a turn result through one scope seam", async () => {
    const target = agent.role({ name: "reviewer", version: "1", instructions: "Review the input." })
    const execute = agent.turn({ name: "reviewer.turn", role: target })
    const attempt = attemptStub({
      events: [
        { type: "reasoning_delta", content: "checking" },
        { type: "content_delta", content: "approved" },
      ],
      result: { content: "approved", stop: true },
    })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)
    const stream = ctx.execStream({ flow: execute, input: { prompt: "review" } })
    const events: session.SessionEvent[] = []

    for await (const event of stream) events.push(event)

    await expect(stream.result).resolves.toMatchObject({
      role: "reviewer",
      content: "approved",
      rounds: 1,
    })
    expect(events.map((event) => event.type)).toEqual([
      "agent_role_start",
      "agent_model_start",
      "model.reasoning_delta",
      "model.content_delta",
      "agent_model_end",
      "agent_role_end",
    ])
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("reads the attempt provider from execution tags", async () => {
    const target = agent.role({ name: "tagged", version: "1" })
    const execute = agent.turn({ name: "tagged.turn", role: target })
    const attempt = attemptStub({ events: [], result: { content: "default", stop: true } })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "first" } })).resolves.toMatchObject({ content: "default" })
    await expect(ctx.exec({
      flow: execute,
      input: { prompt: "second" },
      tags: [agent.attempt(attemptStub({ events: [], result: { content: "override", stop: true } }))],
    })).resolves.toMatchObject({ content: "override" })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("validates and executes a resolved tool", async () => {
    const lookup = agent.tool({
      name: "lookup",
      version: "1",
      description: "Loads a ticket",
      input: objectSchema<{ id: string }>((value) => typeof value === "object" && value !== null && "id" in value),
      flow: flow({
        name: "lookup.run",
        parse: typed<{ id: string }>(),
        factory: (ctx) => ({ title: `ticket:${ctx.input.id}` }),
      }),
    })
    const target = agent.role({ name: "triage", version: "1", tools: { lookup } })
    const execute = agent.turn({ name: "triage.turn", role: target })
    const attempt = attemptStub((request) => request.round === 0
      ? {
          events: [],
          result: { content: "checking", toolCalls: [{ name: "lookup", input: { id: "42" } }] },
        }
      : { events: [], result: { content: `ready:${request.messages.at(-1)?.content}`, stop: true } })
    const authority = testAuthority(["lookup"])
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "triage" } })).resolves.toMatchObject({
      content: 'ready:{"title":"ticket:42"}',
      toolResults: [{ name: "lookup", input: { id: "42" }, output: { title: "ticket:42" } }],
    })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("rejects invalid tool input before the tool flow runs", async () => {
    let calls = 0
    const lookup = agent.tool({
      name: "lookup",
      version: "1",
      description: "Loads a ticket",
      input: objectSchema<{ id: string }>((value) => typeof value === "object" && value !== null && "id" in value),
      flow: flow({
        name: "lookup.run",
        parse: typed<{ id: string }>(),
        factory: () => { calls++; return "unreachable" },
      }),
    })
    const execute = agent.turn({
      name: "invalid.turn",
      role: agent.role({ name: "invalid", version: "1", tools: { lookup } }),
    })
    const attempt = attemptStub({
      events: [],
      result: { content: "checking", toolCalls: [{ name: "lookup", input: {} }] },
    })
    const authority = testAuthority(["lookup"])
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "triage" } })).rejects.toBeInstanceOf(agent.ToolInputError)
    expect(calls).toBe(0)
    await ctx.close({ ok: false, error: new Error("expected") })
    await root.close()
    await scope.dispose()
  })

  it("loads a skill only when the model requests it", async () => {
    const policy = agent.skill({
      name: "policy",
      version: "1",
      description: "Routing policy",
      content: "route to support",
    })
    const target = agent.role({ name: "router", version: "1", skills: { policy } })
    const execute = agent.turn({ name: "router.turn", role: target })
    const attempt = attemptStub((request) => request.loadedSkills.length === 0
      ? { events: [], result: { content: "need policy", skillCalls: [{ name: "policy" }] } }
      : { events: [], result: { content: `policy:${request.loadedSkills[0]?.content}`, stop: true } })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "route" } })).resolves.toMatchObject({
      content: "policy:route to support",
      skillResults: [{ name: "policy", content: "route to support" }],
    })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("runs subagents through the same session runtime", async () => {
    const childRole = agent.role({ name: "summarizer", version: "1" })
    const childTurn = agent.turn({ name: "summarizer.turn", role: childRole })
    const summarize = agent.subagent({
      name: "summarizer",
      version: "1",
      description: "Summarizes context",
      role: childRole,
      turn: childTurn,
    })
    const parentRole = agent.role({ name: "triage", version: "1", subagents: { summarize } })
    const parentTurn = agent.turn({ name: "triage.turn", role: parentRole })
    const attempt = attemptStub((request) => request.agentName === "summarizer"
      ? { events: [], result: { content: `summary:${request.messages.at(-1)?.content}`, stop: true } }
      : request.round === 0
        ? { events: [], result: { content: "delegating", subagentCalls: [{ name: "summarizer", input: { prompt: "ticket 42" } }] } }
        : { events: [], result: { content: `ready:${request.messages.at(-1)?.content}`, stop: true } })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    const runtime = await ctx.resolve(session.session)

    const result = await ctx.exec({ flow: parentTurn, input: { prompt: "triage" } })

    expect(result.content).toBe("ready:summary:ticket 42")
    expect(result.subagentResults).toMatchObject([{
      name: "summarizer",
      input: { prompt: "ticket 42" },
      output: { role: "summarizer", content: "summary:ticket 42" },
    }])
    expect(runtime.record.work).toMatchObject([
      { role: "summarizer", status: "completed" },
    ])
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("preserves workflow routing tags on tool flows", async () => {
    const remote = agent.tool({
      name: "remote",
      version: "1",
      description: "Runs remotely",
      input: objectSchema<Record<string, never>>(() => true),
      flow: flow({
        name: "remote.run",
        parse: typed<Record<string, never>>(),
        tags: [step({ remote: true, timeoutMs: 500, kind: "code" })],
        factory: () => ({ route: "local" }),
      }),
    })
    const routed: unknown[] = []
    const extensions = kit({
      remoteRunner: {
        run: (event) => {
          routed.push(event.ctx.data.seekTag(step))
          return Promise.resolve({ route: event.targetName })
        },
      },
    }).extensions
    const target = agent.role({ name: "router", version: "1", tools: { remote } })
    const execute = agent.turn({ name: "router.turn", role: target })
    const attempt = attemptStub((request) => request.round === 0
      ? { events: [], result: { content: "routing", toolCalls: [{ name: "remote", input: {} }] } }
      : { events: [], result: { content: `done:${request.messages.at(-1)?.content}`, stop: true } })
    const authority = testAuthority(["remote"])
    const scope = createScope({ extensions })
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "route" } })).resolves.toMatchObject({
      content: 'done:{"route":"remote.run"}',
      toolResults: [{ output: { route: "remote.run" } }],
    })
    expect(routed).toEqual([{ remote: true, timeoutMs: 500, kind: "code" }])
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("keeps tool messages string-safe for void and cyclic outputs", async () => {
    const empty = objectSchema<Record<string, never>>(() => true)
    const returnsVoid = agent.tool({
      name: "returns-void",
      version: "1",
      description: "Returns void",
      input: empty,
      flow: flow({ name: "returns-void.run", parse: typed<Record<string, never>>(), factory: () => undefined }),
    })
    const returnsCyclic = agent.tool({
      name: "returns-cyclic",
      version: "1",
      description: "Returns a cyclic value",
      input: empty,
      flow: flow({
        name: "returns-cyclic.run",
        parse: typed<Record<string, never>>(),
        factory: () => {
          const value: { count: bigint; self?: unknown } = { count: 1n }
          value.self = value
          return value
        },
      }),
    })
    const execute = agent.turn({
      name: "string-safe.turn",
      role: agent.role({ name: "string-safe", version: "1", tools: { returnsVoid, returnsCyclic } }),
    })
    const attempt = attemptStub((request) => request.round === 0
      ? {
          events: [],
          result: {
            content: "collecting",
            toolCalls: [
              { name: "returns-void", input: {} },
              { name: "returns-cyclic", input: {} },
            ],
          },
        }
      : {
          events: [],
          result: {
            content: `done:${request.messages.filter((message) => message.role === "tool").map((message) => message.content).join("|")}`,
            stop: true,
          },
        })
    const authority = testAuthority(["returns-void", "returns-cyclic"])
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "collect" } })).resolves.toMatchObject({
      content: 'done:"undefined"|{"count":"1","self":"[Circular]"}',
    })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("stops when a model response has no calls", async () => {
    const execute = agent.turn({
      name: "stop.turn",
      role: agent.role({ name: "stop", version: "1", maxRounds: 5 }),
    })
    const attempt = attemptStub({ events: [], result: { content: "complete" } })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "go" } })).resolves.toMatchObject({
      content: "complete",
      rounds: 1,
    })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("bounds repeated model calls by the role maxRounds", async () => {
    const policy = agent.skill({ name: "policy", version: "1", description: "Policy", content: "rules" })
    const execute = agent.turn({
      name: "bounded.turn",
      role: agent.role({ name: "bounded", version: "1", maxRounds: 2, skills: { policy } }),
    })
    const attempt = attemptStub({
      events: [],
      result: { content: "again", skillCalls: [{ name: "policy" }] },
    })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    await ctx.resolve(session.session)

    await expect(ctx.exec({ flow: execute, input: { prompt: "go" } })).resolves.toMatchObject({
      content: "again",
      rounds: 2,
      skillResults: [{ name: "policy" }, { name: "policy" }],
    })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("records admitted work and turn events through session.run", async () => {
    const turn = agent.turn({ name: "worker.turn", role: agent.role({ name: "worker", version: "1" }) })
    const run = session.run({ name: "worker.run", turn })
    const attempt = attemptStub({ events: [], result: { content: "done", stop: true } })
    const authority = testAuthority()
    const scope = createScope()
    const root = scope.createContext()
    const ctx = scope.createContext({
      parent: root,
      tags: [
        session.authority(authority),
        session.record(sessionRecord("session-runtime", authority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attempt),
        validation.engine(engine),
      ],
    })
    const runtime = await ctx.resolve(session.session)
    const stream = ctx.execStream({
      flow: run,
      input: {
        work: { id: "work-1", branchId: "main", role: "worker", policy: "all", authority: {} },
        input: { prompt: "go" },
      },
    })
    const events: session.SessionEvent[] = []

    for await (const event of stream) events.push(event)

    await expect(stream.result).resolves.toMatchObject({ role: "worker", content: "done" })
    expect(events.map((event) => event.type)).toEqual([
      "work.started",
      "agent_role_start",
      "agent_model_start",
      "agent_model_end",
      "agent_role_end",
    ])
    expect(runtime.record).toMatchObject({
      work: [{ id: "work-1", status: "completed" }],
      attempts: [{ workId: "work-1", status: "completed" }],
    })
    await ctx.close()
    await root.close()
    await scope.dispose()
  })

  it("isolates role resources and attempts between explicitly composed sessions", async () => {
    const target = agent.role({ name: "isolated", version: "1" })
    const execute = agent.turn({ name: "isolated.turn", role: target })
    const firstAuthority = testAuthority()
    const firstScope = createScope()
    const firstRoot = firstScope.createContext()
    const first = firstScope.createContext({
      parent: firstRoot,
      tags: [
        session.authority(firstAuthority),
        session.record(sessionRecord("session-first", firstAuthority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attemptStub({ events: [], result: { content: "first", stop: true } })),
        validation.engine(engine),
      ],
    })
    const secondAuthority = testAuthority()
    const secondScope = createScope()
    const secondRoot = secondScope.createContext()
    const second = secondScope.createContext({
      parent: secondRoot,
      tags: [
        session.authority(secondAuthority),
        session.record(sessionRecord("session-second", secondAuthority)),
        session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
        agent.attempt(attemptStub({ events: [], result: { content: "second", stop: true } })),
        validation.engine(engine),
      ],
    })
    await first.resolve(session.session)
    await second.resolve(session.session)

    await expect(first.exec({ flow: execute, input: { prompt: "go" } })).resolves.toMatchObject({ content: "first" })
    await expect(second.exec({ flow: execute, input: { prompt: "go" } })).resolves.toMatchObject({ content: "second" })
    expect(await first.resolve(target)).not.toBe(await second.resolve(target))
    expect((await first.resolve(session.session)).record.id).toBe("session-first")
    expect((await second.resolve(session.session)).record.id).toBe("session-second")
    await first.close()
    await firstRoot.close()
    await firstScope.dispose()
    await second.close()
    await secondRoot.close()
    await secondScope.dispose()
  })
})

function objectSchema<Output>(accepts: (value: unknown) => boolean) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "sdk-test",
      validate: (value: unknown) => accepts(value)
        ? { value: value as Output }
        : { issues: [{ message: "Invalid test input" }] },
    },
  }
}

const engine: validation.Engine = {
  id: "sdk-test",
  validate: (schema, input) => schema["~standard"].validate(input),
  jsonSchema: () => ({ type: "object" }),
  schemaDigest: () => "sha256:test",
}

function testAuthority(tools: readonly string[] = []): session.Authority {
  return session.createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: [],
    tools,
    sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
  })
}

function sessionRecord(id: string, authority: session.Authority): session.SessionRecord {
  return Object.freeze({
    id,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "root",
      authorityFingerprint: authority.fingerprint,
      authority,
      evidence: [],
    }],
    work: [],
    attempts: [],
    invocations: [],
    artifacts: [],
    memory: [],
    schedules: [],
    providerContinuations: {},
    nextEventSequence: 0,
  })
}
