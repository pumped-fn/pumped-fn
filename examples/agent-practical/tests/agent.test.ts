import { createScope } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import { sandbox } from "@pumped-fn/agent-sdk"
import { box, daily, runHttp, runLocal, runSuite, runThread } from "../src/agent"

it("runs locally with trace and run inspection", async () => {
  const run = await runLocal()

  expect(run.result.content).toContain("ready:")
  expect(run.result.toolResults.map((call) => call.name)).toEqual(["load-ticket", "read-workspace"])
  expect(run.trace.map((event) => event.type)).toContain("agent_tool_end")
  expect(run.run.status).toBe("completed")
  expect(run.run.steps.map((step) => step.targetName)).toContain("triage")
})

it("serves the same agent through fetch", async () => {
  await expect(runHttp()).resolves.toMatchObject({
    agentName: "triage",
    content: expect.stringContaining("ready:"),
  })
})

it("stores a continuing session", async () => {
  const thread = await runThread()

  expect(thread.state.messages.map((message) => message.content)).toEqual([
    "one",
    "loading policy",
    "Escalate unclear incidents.",
    "checking",
    '{"id":"42","title":"ticket:42"}',
    "file:README.md",
    "summary:ticket 42",
    expect.stringContaining("ready:"),
    "two",
    "loading policy",
    "Escalate unclear incidents.",
    "checking",
    '{"id":"42","title":"ticket:42"}',
    "file:README.md",
    "summary:ticket 42",
    expect.stringContaining("ready:"),
  ])
})

it("writes json-safe eval reports", async () => {
  await expect(runSuite()).resolves.toMatchObject({
    name: "triage",
    passed: true,
    cases: [{ name: "uses tools and answers", passed: true }],
  })
})

it("runs schedule adapters through the same scope seam", async () => {
  const scope = createScope({ tags: [sandbox(box)] })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: daily })).resolves.toMatchObject({
    agentName: "triage",
    content: expect.stringContaining("ready:"),
  })

  await ctx.close()
  await scope.dispose()
})
