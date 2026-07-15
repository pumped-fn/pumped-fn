import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  channel,
  delegated,
  http,
  includes,
  judge,
  loaded,
  runEval,
  schedule,
  suite,
  summary,
  used,
} from "../src/index.js"
import type { TurnInput, TurnResult } from "../src/agent.js"

describe("retained workflow and eval adapters", () => {
  it("delegates channel and schedule inputs through declared turn edges", async () => {
    const turn = flow({
      name: "adapter.turn",
      parse: typed<{ prompt: string }>(),
      factory: (ctx) => ctx.input.prompt,
    })
    const inbound = channel({
      name: "adapter.channel",
      parse: typed<{ text: string }>(),
      turn,
      input: (ctx) => ({ prompt: `channel:${ctx.input.text}` }),
    })
    const scheduled = schedule({
      name: "adapter.schedule",
      turn,
      input: () => ({ prompt: "schedule:tick" }),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: inbound, input: { text: "hello" } })).resolves.toBe("channel:hello")
    await expect(ctx.exec({ flow: scheduled })).resolves.toBe("schedule:tick")

    await ctx.close()
    await scope.dispose()
  })

  it("binds request tags and input through the HTTP turn edge", async () => {
    const requestId = tag<string>({ label: "adapter.request-id" })
    const turn = flow({
      name: "adapter.http-turn",
      parse: typed<{ prompt: string }>(),
      deps: { requestId: tags.required(requestId) },
      factory: (ctx, deps) => ({ content: ctx.input.prompt, requestId: deps.requestId }),
    })
    const inbound = http({
      name: "adapter.http",
      turn,
      input: async (request) => ({ prompt: await request.text() }),
      tags: () => [requestId("request-1")],
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const response = await ctx.exec({
      flow: inbound,
      input: new Request("https://example.test/analyze", { method: "POST", body: "inspect" }),
    })

    await expect(response.json()).resolves.toEqual({ content: "inspect", requestId: "request-1" })

    await ctx.close()
    await scope.dispose()
  })

  it("runs eval checks and judges and preserves compatibility events in summaries", async () => {
    const turn = flow({
      name: "adapter.eval-turn",
      parse: typed<TurnInput>(),
      factory: (): TurnResult => ({
        role: "analyst",
        content: "index ready",
        messages: [],
        rounds: 1,
        toolResults: [{ name: "inspect_schema", input: {}, output: { tables: 1 } }],
        skillResults: [{ name: "database-guide", content: "read only" }],
        subagentResults: [{
          name: "query-reviewer",
          workId: "child-1",
          input: { prompt: "review" },
          output: {
            role: "reviewer",
            content: "approved",
            messages: [],
            rounds: 1,
            toolResults: [],
            skillResults: [],
            subagentResults: [],
            events: [],
          },
        }],
        events: [{
          sessionId: "session-1",
          workId: "work-1",
          attempt: 1,
          branchId: "main",
          sequence: 1,
          snapshotEpoch: 1,
          type: "agent_tool_end",
          agentName: "analyst",
          targetName: "inspect_schema",
          round: 0,
          observedAt: "2026-07-14T00:00:00.000Z",
        }, {
          sessionId: "session-1",
          workId: "work-1",
          attempt: 1,
          branchId: "main",
          sequence: 2,
          snapshotEpoch: 1,
          type: "work.started",
          observedAt: "2026-07-14T00:00:00.000Z",
        }],
      }),
    })
    const approved = judge({ name: "approved", evaluate: () => ({ name: "approved", passed: true, score: 1 }) })
    const grounded = judge({ name: "grounded", evaluate: () => ({ name: "grounded", passed: true, score: 1 }) })
    const target = suite({
      name: "database-eval",
      turn,
      cases: [{
        name: "read-only",
        input: { prompt: "inspect" },
        checks: [
          includes("index"),
          used("inspect_schema"),
          loaded("database-guide"),
          delegated("query-reviewer"),
        ],
      }],
      judges: [approved, grounded],
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const report = await runEval(ctx, target)

    expect(report).toMatchObject({ passed: true, cases: [{ passed: true }] })
    const rendered = summary(report)
    expect(rendered).toMatchObject({
      cases: [{
        events: [{
          type: "agent_tool_end",
          agentName: "analyst",
          targetName: "inspect_schema",
          round: 0,
        }, { type: "work.started" }],
      }],
    })
    expect(JSON.stringify(rendered)).not.toContain('"undefined"')
    expect(() => suite({ name: "invalid", turn, cases: [], judges: [approved] })).toThrow(
      "Agent evals require zero judges or at least two judges",
    )

    await ctx.close()
    await scope.dispose()
  })
})
