import { createScope } from "@pumped-fn/lite"
import { model as agentModel } from "@pumped-fn/sdk"
import { expect, it } from "vitest"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { daily, local, model, runClaude, runCodex, runHttp, runLocal, runSuite, runThread } from "../src/agent"

async function modelCommand() {
  const dir = await mkdtemp(join(tmpdir(), "pumped-fn-agent-model-"))
  const command = join(dir, "model")
  await writeFile(command, `#!/bin/sh
for last do :; done
case "$last" in
  *"Agent: summarize"*)
    printf '%s' '{"content":"summary:ticket 42","stop":true}'
    ;;
  *"Round: 0"*)
    printf '%s' '{"content":"loading policy","skillCalls":[{"name":"policy"}],"stop":false}'
    ;;
  *"Round: 1"*)
    printf '%s' '{"content":"checking","toolCalls":[{"name":"load-ticket","input":{"id":"42"}},{"name":"read-workspace","input":{"path":"README.md"}}],"subagentCalls":[{"name":"summarize","input":{"prompt":"ticket 42"}}],"stop":false}'
    ;;
  *)
    printf '%s' '{"content":"ready:external provider","stop":true}'
    ;;
esac
`)
  await chmod(command, 0o755)
  return {
    command,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

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

it("runs through the Codex provider package with a just-bash workspace", async () => {
  const command = await modelCommand()
  const run = await runCodex({ command: command.command, isolate: false, guard: false })

  expect(run.result.content).toBe("ready:external provider")
  expect(run.result.toolResults.map((call) => call.output)).toEqual([
    { id: "42", title: "ticket:42" },
    "file:README.md",
  ])
  expect(run.result.subagentResults[0]?.output.content).toBe("summary:ticket 42")

  await command.cleanup()
})

it("runs through the Claude provider package with a just-bash workspace", async () => {
  const command = await modelCommand()
  const run = await runClaude({ command: command.command, isolate: false, guard: false })

  expect(run.result.content).toBe("ready:external provider")
  expect(run.result.toolResults.map((call) => call.name)).toEqual(["load-ticket", "read-workspace"])
  expect(run.result.skillResults.map((call) => call.name)).toEqual(["policy"])

  await command.cleanup()
})

it("runs schedule adapters through the same scope seam", async () => {
  const scope = createScope({ tags: [local, agentModel(model)] })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: daily })).resolves.toMatchObject({
    agentName: "triage",
    content: expect.stringContaining("ready:"),
  })

  await ctx.close()
  await scope.dispose()
})
