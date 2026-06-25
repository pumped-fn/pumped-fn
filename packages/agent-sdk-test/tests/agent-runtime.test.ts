import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  events,
  session,
  channel,
  agent,
  http,
  inspect,
  suite,
  judge,
  schedule,
  skill,
  sub,
  tool,
  includes,
  model as agentModel,
  runEval,
  summary,
  turn,
  send,
  sandbox,
  loaded,
  step,
  delegated,
  used,
  type Model,
} from "@pumped-fn/agent-sdk"
import { kit, MemoryWorkflowLog } from "../src/index"

describe("agent application runtime", () => {
  it("runs tools, subagents, and model rounds through one lite execution seam", async () => {
    const lookup = tool({
      description: "Loads a ticket title",
      flow: flow({
        name: "lookup-ticket",
        parse: typed<{ id: string }>(),
        factory: (ctx) => ({ id: ctx.input.id, title: `ticket:${ctx.input.id}` }),
      }),
    })
    const summarizeModel: Model = {
      complete: (_ctx, request) => ({
        content: `summary:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }),
    }
    const summarize = agent({
      name: "summarize-ticket",
      instructions: "Summarize ticket context.",
      tags: [agentModel(summarizeModel)],
    })
    const triageModel: Model = {
      complete: (_ctx, request) => {
        if (request.round === 0) {
          return {
            content: "checking",
            toolCalls: [{ name: "lookup-ticket", input: { id: "42" } }],
            subagentCalls: [{ name: "summarize-ticket", input: { prompt: "ticket 42" } }],
          }
        }
        return {
          content: `ready:${request.messages.map((message) => message.content).join("|")}`,
          stop: true,
        }
      },
    }
    const triage = agent({
      name: "triage-ticket",
      instructions: "Triage tickets with tools and delegated summaries.",
      tags: [agentModel(triageModel)],
      tools: [lookup],
      skills: [
        skill({
          name: "triage-policy",
          description: "Ticket triage policy",
          content: "Escalate unclear incidents.",
        }),
      ],
      subagents: [
        sub({
          description: "Summarizes ticket context.",
          agent: summarize,
        }),
      ],
    })
    const { extensions, log } = kit()
    const scope = createScope({ extensions })
    const ctx = scope.createContext()

    const result = await turn(ctx, triage, { prompt: "triage FEAT-42" })
    const buffer = await ctx.resolve(events)

    expect(result.content).toContain("ready:")
    expect(result.toolResults).toEqual([
      {
        name: "lookup-ticket",
        input: { id: "42" },
        output: { id: "42", title: "ticket:42" },
      },
    ])
    expect(result.subagentResults[0]?.output.content).toBe("summary:ticket 42")
    expect(result.subagentResults[0]?.output.events.map((event) => event.type)).toEqual([
      "agent_start",
      "agent_model_start",
      "agent_model_end",
      "agent_end",
    ])
    expect(result.events.map((event) => event.type)).toEqual(buffer.events.map((event) => event.type))
    expect(buffer.events.map((event) => event.type)).toEqual([
      "agent_start",
      "agent_model_start",
      "agent_model_end",
      "agent_tool_start",
      "agent_tool_end",
      "agent_subagent_start",
      "agent_start",
      "agent_model_start",
      "agent_model_end",
      "agent_end",
      "agent_subagent_end",
      "agent_model_start",
      "agent_model_end",
      "agent_end",
    ])
    expect(log.entries().filter((entry) => entry.status === "completed").map((entry) => entry.targetName)).toEqual([
      "lookup-ticket",
      "summarize-ticket",
      "triage-ticket",
    ])

    await ctx.close()
    await scope.dispose()
  })

  it("reads model providers from tags", async () => {
    const taggedModel: Model = {
      complete: (_ctx, request) => ({
        content: `tagged:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }),
    }
    const overrideModel: Model = {
      complete: (_ctx, request) => ({
        content: `override:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }),
    }
    const target = agent({
      name: "tagged-model-agent",
      tags: [agentModel(taggedModel)],
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(turn(ctx, target, { prompt: "default" })).resolves.toMatchObject({
      content: "tagged:default",
    })
    await expect(ctx.exec({
      flow: target.turn,
      input: { prompt: "local" },
      name: target.name,
      tags: [agentModel(overrideModel)],
    })).resolves.toMatchObject({
      content: "override:local",
    })

    await ctx.close()
    await scope.dispose()
  })

  it("runs evals with deterministic checks and a judge quorum", async () => {
    const model: Model = {
      complete: () => ({
        content: "approved after lookup",
        stop: true,
      }),
    }
    const reviewer = agent({
      name: "reviewer",
      tags: [agentModel(model)],
    })
    const accepts = judge({
      name: "accepts",
      evaluate: () => ({ name: "accepts", passed: true, score: 1 }),
    })
    const grounded = judge({
      name: "grounded",
      evaluate: () => ({ name: "grounded", passed: true, score: 1 }),
    })
    const evaluation = suite({
      name: "reviewer-quality",
      agent: reviewer,
      cases: [
        {
          name: "answers with approval",
          input: { prompt: "review" },
          checks: [includes("approved")],
        },
      ],
      judges: [accepts, grounded],
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(runEval(ctx, evaluation)).resolves.toMatchObject({
      name: "reviewer-quality",
      passed: true,
      cases: [
        {
          name: "answers with approval",
          passed: true,
          checks: [{ passed: true }],
          judges: [{ passed: true }, { passed: true }],
        },
      ],
    })

    await ctx.close()
    await scope.dispose()
  })

  it("rejects a single judge as a quality gate", async () => {
    const model: Model = {
      complete: () => ({ content: "ok", stop: true }),
    }
    const target = agent({
      name: "single-judge-target",
      tags: [agentModel(model)],
    })
    const single = judge({
      name: "single",
      evaluate: () => ({ name: "single", passed: true }),
    })

    expect(() => suite({
      name: "single-judge",
      agent: target,
      cases: [{ name: "case", input: { prompt: "x" } }],
      judges: [single],
    })).toThrow("Agent evals require zero judges or at least two judges")
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(runEval(ctx, {
      name: "single-judge",
      agent: target,
      cases: [{ name: "case", input: { prompt: "x" } }],
      judges: [single],
    })).rejects.toThrow("Agent evals require zero judges or at least two judges")

    await ctx.close()
    await scope.dispose()
  })

  it("loads skills on model request through a replayable step", async () => {
    const model: Model = {
      complete: (_ctx, request) => request.loadedSkills.length === 0
        ? {
            content: "need policy",
            skillCalls: [{ name: "policy" }],
          }
        : {
            content: `policy:${request.loadedSkills[0]?.content}`,
            stop: true,
          },
    }
    const target = agent({
      name: "skill-agent",
      tags: [agentModel(model)],
      skills: [
        skill({
          name: "policy",
          description: "Routing policy",
          load: () => "route to support",
        }),
      ],
    })
    const { extensions, log } = kit()
    const scope = createScope({ extensions })
    const ctx = scope.createContext()

    const result = await turn(ctx, target, { prompt: "route" })

    expect(result.content).toBe("policy:route to support")
    expect(result.skillResults).toEqual([{ name: "policy", content: "route to support" }])
    expect(log.entries().filter((entry) => entry.status === "completed").map((entry) => entry.targetName)).toEqual([
      "policy",
      "skill-agent",
    ])

    await ctx.close()
    await scope.dispose()
  })

  it("preserves tool step routing config when executing through an agent", async () => {
    const remoteTool = tool({
      description: "Runs remotely",
      flow: flow({
        name: "remote-tool",
        parse: typed<{ id: string }>(),
        tags: [step({ remote: true, timeoutMs: 500, kind: "code" })],
        factory: () => {
          throw new Error("remote tool should route")
        },
      }),
    })
    const model: Model = {
      complete: (_ctx, request) => request.round === 0
        ? {
            content: "routing",
            toolCalls: [{ name: "remote-tool", input: { id: "42" } }],
          }
        : {
            content: `done:${request.messages.at(-1)?.content ?? ""}`,
            stop: true,
          },
    }
    const target = agent({
      name: "remote-agent",
      tags: [agentModel(model)],
      tools: [remoteTool],
    })
    const routed: unknown[] = []
    const { extensions, log } = kit({
      remoteRunner: {
        run: (event) => {
          routed.push(event.ctx.data.seekTag(step))
          return { route: event.targetName }
        },
      },
    })
    const scope = createScope({ extensions })
    const ctx = scope.createContext()

    await expect(turn(ctx, target, { prompt: "route" }))
      .resolves.toMatchObject({
        content: 'done:{"route":"remote-tool"}',
        toolResults: [{ output: { route: "remote-tool" } }],
      })
    expect(routed).toEqual([{ workflow: true, remote: true, timeoutMs: 500, kind: "code" }])
    expect(log.entries().filter((entry) => entry.status === "completed").map((entry) => entry.targetName)).toEqual([
      "remote-tool",
      "remote-agent",
    ])

    await ctx.close()
    await scope.dispose()
  })

  it("keeps tool message content string-safe for void and non-json outputs", async () => {
    const returnsVoid = tool({
      description: "Returns void",
      flow: flow({
        name: "returns-void",
        parse: typed<Record<string, never>>(),
        factory: () => undefined,
      }),
    })
    const returnsCyclic = tool({
      description: "Returns a cyclic object",
      flow: flow({
        name: "returns-cyclic",
        parse: typed<Record<string, never>>(),
        factory: () => {
          const value: { count: bigint; self?: unknown } = { count: 1n }
          value.self = value
          return value
        },
      }),
    })
    const model: Model = {
      complete: (_ctx, request) => request.round === 0
        ? {
            content: "collecting",
            toolCalls: [
              { name: "returns-void", input: {} },
              { name: "returns-cyclic", input: {} },
            ],
          }
        : {
            content: `done:${request.messages.filter((message) => message.role === "tool").map((message) => message.content).join("|")}`,
            stop: true,
          },
    }
    const target = agent({
      name: "string-safe-agent",
      tags: [agentModel(model)],
      tools: [returnsVoid, returnsCyclic],
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(turn(ctx, target, { prompt: "collect" }))
      .resolves.toMatchObject({
        content: 'done:undefined|{"count":"1","self":"[Circular]"}',
      })

    await ctx.close()
    await scope.dispose()
  })

  it("exposes deterministic check helpers for tools, skills, and subagents", () => {
    expect(used("load")({
      agentName: "agent",
      content: "",
      messages: [],
      skillResults: [],
      toolResults: [{ name: "load", input: {}, output: {} }],
      subagentResults: [],
      rounds: 1,
      events: [],
    })).toEqual({ name: 'tool used "load"', passed: true })
    expect(delegated("review")({
      agentName: "agent",
      content: "",
      messages: [],
      skillResults: [],
      toolResults: [],
      subagentResults: [{
        name: "review",
        input: { prompt: "x" },
        output: {
          agentName: "review",
          content: "ok",
          messages: [],
          skillResults: [],
          toolResults: [],
          subagentResults: [],
          rounds: 1,
          events: [],
        },
      }],
      rounds: 1,
      events: [],
    })).toEqual({ name: 'subagent used "review"', passed: true })
    expect(loaded("policy")({
      agentName: "agent",
      content: "",
      messages: [],
      skillResults: [{ name: "policy", content: "rules" }],
      toolResults: [],
      subagentResults: [],
      rounds: 1,
      events: [],
    })).toEqual({ name: 'skill loaded "policy"', passed: true })
  })

  it("routes channel and schedule adapters through agent turns", async () => {
    const model: Model = {
      complete: (_ctx, request) => ({
        content: `seen:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }),
    }
    const target = agent({
      name: "channel-target",
      tags: [agentModel(model)],
    })
    const slack = channel({
      name: "slack-message",
      parse: typed<{ text: string }>(),
      agent: target,
      input: (ctx) => ({ prompt: ctx.input.text }),
    })
    const daily = schedule({
      name: "daily-digest",
      agent: target,
      input: () => ({ prompt: "daily digest" }),
    })
    const { extensions, log } = kit()
    const scope = createScope({ extensions })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: slack, input: { text: "hello" } }))
      .resolves.toMatchObject({ content: "seen:hello" })
    await expect(ctx.exec({ flow: daily }))
      .resolves.toMatchObject({ content: "seen:daily digest" })
    expect(log.entries().filter((entry) => entry.status === "completed").map((entry) => entry.targetName)).toEqual([
      "channel-target",
      "slack-message",
      "channel-target",
      "daily-digest",
    ])

    await ctx.close()
    await scope.dispose()
  })

  it("adapts fetch requests into agent turns", async () => {
    const model: Model = {
      complete: (_ctx, request) => ({
        content: `http:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }),
    }
    const target = agent({
      name: "http-agent",
      tags: [agentModel(model)],
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const handle = http({ agent: target })

    const response = await ctx.exec({
      flow: handle,
      input: new Request("https://agent.local/run", {
        method: "POST",
        body: JSON.stringify({ prompt: "ping" }),
      }),
    })

    await expect(response.json()).resolves.toMatchObject({
      agentName: "http-agent",
      content: "http:ping",
    })
    await ctx.close()
    await scope.dispose()
  })

  it("inspects workflow log runs and filters by run id", async () => {
    const log = new MemoryWorkflowLog()
    await log.putPending({
      status: "pending",
      key: { taskId: "task-a", runId: "run-a", step: 0 },
      targetName: "approval",
      input: { id: "1" },
      kind: "review",
    })
    await log.putCompleted({
      status: "completed",
      key: { taskId: "task-a", runId: "run-b", step: 0 },
      targetName: "other",
      result: "done",
    })

    await expect(inspect(log, { taskId: "task-a", runId: "run-a" })).resolves.toEqual({
      taskId: "task-a",
      runId: "run-a",
      status: "pending",
      steps: [
        {
          key: { taskId: "task-a", runId: "run-a", step: 0 },
          status: "pending",
          targetName: "approval",
          input: { id: "1" },
          kind: "review",
        },
      ],
    })
  })

  it("injects sandbox capability through the scope seam", async () => {
    const readWorkspace = tool({
      description: "Reads a workspace file",
      flow: flow({
        name: "read-workspace",
        parse: typed<{ path: string }>(),
        deps: { sandbox: tags.required(sandbox) },
        factory: (ctx, deps) => deps.sandbox.readFile(ctx.input.path),
      }),
    })
    const model: Model = {
      complete: (_ctx, request) => request.round === 0
        ? {
            content: "reading",
            toolCalls: [{ name: "read-workspace", input: { path: "README.md" } }],
          }
        : {
            content: `read:${request.messages.at(-1)?.content ?? ""}`,
            stop: true,
          },
    }
    const target = agent({
      name: "sandbox-agent",
      tags: [agentModel(model)],
      tools: [readWorkspace],
    })
    const scope = createScope({
      tags: [
        sandbox({
          readFile: (path) => `file:${path}`,
          writeFile: () => undefined,
          exec: (command, args = []) => ({
            stdout: [command, ...args].join(" "),
            stderr: "",
            exitCode: 0,
          }),
        }),
      ],
    })
    const ctx = scope.createContext()

    await expect(turn(ctx, target, { prompt: "read" }))
      .resolves.toMatchObject({
        content: "read:file:README.md",
        toolResults: [{ output: "file:README.md" }],
      })

    await ctx.close()
    await scope.dispose()
  })

  it("stores continuing session messages as a material", async () => {
    const model: Model = {
      complete: (_ctx, request) => ({
        content: `turn:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }),
    }
    const target = agent({
      name: "session-agent",
      tags: [agentModel(model)],
    })
    const thread = session("session")
    const scope = createScope()
    const ctx = scope.createContext()

    await send(ctx, thread, target, { prompt: "one" })
    await send(ctx, thread, target, { prompt: "two" })

    expect(ctx.scope.controller(thread).get()).toEqual({
      name: "session",
      kind: "json",
      revision: 2,
      state: {
        messages: [
          { role: "user", content: "one" },
          { role: "assistant", content: "turn:one" },
          { role: "user", content: "two" },
          { role: "assistant", content: "turn:two" },
        ],
      },
    })

    await ctx.close()
    await scope.dispose()
  })

  it("summarizes eval reports as json-safe artifacts", async () => {
    const model: Model = {
      complete: () => ({
        content: "ready",
        stop: true,
      }),
    }
    const target = agent({
      name: "summary-agent",
      tags: [agentModel(model)],
    })
    const evaluation = suite({
      name: "summary-suite",
      agent: target,
      cases: [{ name: "case", input: { prompt: "go" }, checks: [includes("ready")] }],
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const report = await runEval(ctx, evaluation)

    expect(summary(report)).toMatchObject({
      name: "summary-suite",
      passed: true,
      cases: [{ name: "case", output: "ready", passed: true }],
    })

    await ctx.close()
    await scope.dispose()
  })
})
