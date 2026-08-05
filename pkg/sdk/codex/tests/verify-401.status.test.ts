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
  agentName: "verify-401",
  instructions: "reply",
  messages: [],
  tools: [],
  skills: [],
  loadedSkills: [],
  subagents: [],
  round: 0,
}

it("does not emit completed when the CLI response cannot be parsed", async () => {
  const plain = flow({
    name: "verify-401.codex.plain",
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
  const draining = collect(stream, events)

  await expect(draining).rejects.toBeInstanceOf(ModelResponseParseError)
  await expect(stream.result).rejects.toBeInstanceOf(ModelResponseParseError)
  expect(events).not.toContainEqual({ type: "provider_status", status: "completed" })

  await ctx.close()
  await scope.dispose()
})

it("records an ACP parse failure as a failed invocation", async () => {
  const authority = testAuthority()
  const scope = createScope({ tags: [
    managedConfig(plainAgent),
    session.authority(authority),
    session.record(record(authority)),
    session.clock({ now: () => "2026-08-05T00:00:00.000Z" }),
    session.execution.turn({ flow: codexAcpAttempt }),
  ] })
  const ctx = scope.createContext()
  const runtime = await ctx.resolve(session.session)
  const stream = ctx.execStream({
    flow: session.run,
    input: {
      work: { id: "parse", branchId: "main", role: "test", policy: "all" },
      input: request,
    },
  })
  const events: unknown[] = []
  const draining = collect(stream, events)

  await expect(draining).rejects.toBeInstanceOf(ModelResponseParseError)
  await expect(stream.result).rejects.toBeInstanceOf(ModelResponseParseError)
  expect(events).not.toContainEqual({ type: "provider_status", status: "completed" })
  expect(runtime.record.invocations).toMatchObject([{ status: "failed" }])

  await ctx.close()
  await scope.dispose()
})

it("sends exactly one ACP cancel and keeps the process usable", async () => {
  const scope = createScope({ tags: [managedConfig(cancelAgent)] })
  const ctx = scope.createContext()
  const controller = new AbortController()
  const first = ctx.execStream({ flow: codexAcpAttempt, input: request, signal: controller.signal })
  const events: unknown[] = []
  const draining = collect(first, events)
  while (!events.some((event) => JSON.stringify(event).includes("started"))) await tick()

  controller.abort()
  controller.abort()
  await expect(draining).rejects.toMatchObject({ name: "AbortError" })
  await expect(first.result).rejects.toMatchObject({ name: "AbortError" })

  await expect(ctx.exec({ flow: codexAcpAttempt, input: request })).resolves.toEqual({
    content: "cancel-count=1",
    stop: true,
  })

  await ctx.close()
  await scope.dispose()
})

function managedConfig(source: string) {
  return codexAcpConfig({
    auth: { kind: "global" },
    command: process.execPath,
    args: ["--input-type=module", "--eval", source],
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 1_000,
  })
}

const plainAgent = String.raw`
import readline from "node:readline"
const lines = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "plain", version: "1" } } })
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "plain" } })
  } else if (message.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "plain", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "plain provider prose" } } } })
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
  }
})
`

const cancelAgent = String.raw`
import readline from "node:readline"
const lines = readline.createInterface({ input: process.stdin })
let nextSession = 0
let pending
let cancelCount = 0
let first = true
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "cancel", version: "1" } } })
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "session-" + nextSession++ } })
  } else if (message.method === "session/prompt" && first) {
    first = false
    pending = message.id
  } else if (message.method === "session/prompt") {
    const sessionId = message.params.sessionId
    const text = JSON.stringify({ content: "cancel-count=" + cancelCount, stop: true })
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } })
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
  } else if (message.method === "session/cancel") {
    cancelCount++
    send({ jsonrpc: "2.0", id: pending, result: { stopReason: "cancelled" } })
    pending = undefined
  }
})
`

function testAuthority(): session.Authority {
  return session.createAuthority({
    tenant: "verify-401",
    roots: [process.cwd()],
    permissions: [],
    tools: [],
    sandbox: { roots: [process.cwd()], commands: [], write: false, network: false },
  })
}

function record(authority: session.Authority): session.SessionRecord {
  return {
    id: "verify-401",
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
    schedules: [],
    providerContinuations: {},
    memory: [],
    nextEventSequence: 0,
  }
}

async function collect<T>(stream: AsyncIterable<T>, values: T[]): Promise<void> {
  for await (const value of stream) values.push(value)
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
