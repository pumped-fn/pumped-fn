import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  delegated,
  includes,
  judge,
  loaded,
  runEval,
  suite,
  summary,
  used,
} from "../src/index.js"
import type { TurnInput, TurnResult } from "../src/agent.js"

describe("retained eval helpers", () => {
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
