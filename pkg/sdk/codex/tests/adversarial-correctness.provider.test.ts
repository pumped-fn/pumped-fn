import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { ModelResponseParseError, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import * as session from "@pumped-fn/sdk/session"
import { expect, it } from "vitest"
import {
  codexAcpAttempt,
  codexAcpConfig,
  codexAttempt,
  codexConfig,
  codexRun,
} from "../src/index"

const request: ModelRequest = {
  agentName: "adversarial",
  instructions: "reply",
  messages: [],
  tools: [],
  skills: [],
  loadedSkills: [],
  subagents: [],
  round: 0,
}

it("does not complete the CLI attempt when response parsing fails", async () => {
  const plain = flow({
    name: "adversarial.codex.plain",
    parse: typed<PromptInput>(),
    factory: () => "plain provider prose",
  })
  const scope = createScope({
    presets: [preset(codexRun, plain)],
    tags: [codexConfig({ auth: { kind: "global" }, cwd: process.cwd() })],
  })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: codexAttempt, input: request })
  const events: unknown[] = []
  const draining = (async () => {
    for await (const event of stream) events.push(event)
  })()

  await expect(draining).rejects.toBeInstanceOf(ModelResponseParseError)
  await expect(stream.result).rejects.toBeInstanceOf(ModelResponseParseError)
  expect(events).toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: "plain provider prose" },
  ])
  await ctx.close()
  await scope.dispose()
})

it("fails the ACP invocation when response parsing fails", async () => {
  const bound = testAuthority()
  const scope = createScope({ tags: [
    codexAcpConfig({
      auth: { kind: "global" },
      command: process.execPath,
      args: ["--input-type=module", "--eval", plainAcpAgent],
      cwd: process.cwd(),
      roots: [],
      permission: "deny",
      shutdownTimeoutMs: 1_000,
    }),
    session.authority(bound),
    session.record(record(bound)),
    session.clock({ now: () => "2026-08-05T00:00:00.000Z" }),
    session.execution.turn({ flow: codexAcpAttempt }),
  ] })
  const ctx = scope.createContext()
  const runtime = await ctx.resolve(session.session)
  const stream = ctx.execStream({
    flow: session.run,
    input: {
      work: { id: "parse-work", branchId: "main", role: "test", policy: "all" },
      input: request,
    },
  })
  const events: unknown[] = []
  const draining = (async () => {
    for await (const event of stream) events.push(event)
  })()

  await expect(draining).rejects.toBeInstanceOf(ModelResponseParseError)
  await expect(stream.result).rejects.toBeInstanceOf(ModelResponseParseError)
  expect(events).not.toContainEqual({ type: "provider_status", status: "completed" })
  expect(runtime.record.work.find((value) => value.id === "parse-work")?.status).toBe("failed")
  expect(runtime.record.invocations).toMatchObject([{ status: "failed" }])
  await ctx.close()
  await scope.dispose()
})

const plainAcpAgent = String.raw`
import readline from "node:readline"
const lines = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "plain", version: "1" } } })
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "plain-session" } })
  } else if (message.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "plain-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "plain provider prose" } } } })
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
  }
})
`

function testAuthority() {
  return session.createAuthority({
    tenant: "adversarial",
    roots: [process.cwd()],
    permissions: [],
    tools: [],
    sandbox: { roots: [process.cwd()], commands: [], write: false, network: false },
  })
}

function record(bound: ReturnType<typeof testAuthority>): session.SessionRecord {
  return {
    id: "adversarial-codex",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: bound.fingerprint,
    authorityConstraints: bound,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "root",
      authorityFingerprint: bound.fingerprint,
      authority: bound,
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
  }
}
