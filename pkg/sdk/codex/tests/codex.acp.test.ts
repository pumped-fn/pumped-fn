import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process"
import { createScope, preset, type Lite } from "@pumped-fn/lite"
import type { ModelRequest } from "@pumped-fn/sdk"
import * as session from "@pumped-fn/sdk/session"
import { expect, it } from "vitest"
import {
  acp,
  clock,
  CodexShutdownError,
  codexAcpAttempt,
  codexAcpConfig,
  codexAcpPrompt,
  environment,
} from "../src/index"
import { spawnProcess } from "../src/adapters/process"

const request: ModelRequest = {
  agentName: "probe",
  instructions: "report roots",
  messages: [{ role: "user", content: "ready?" }],
  tools: [],
  skills: [],
  loadedSkills: [],
  subagents: [],
  round: 0,
}

const agent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
let pending
let active
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "probe", version: "1" } } })
  } else if (message.method === "session/new") {
    globalThis.session = message.params
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "probe-session" } })
  } else if (message.method === "session/prompt") {
    if (JSON.stringify(message.params).includes("wait for cancellation")) {
      pending = message.id
    } else {
      active = message.id
      send({ jsonrpc: "2.0", id: 99, method: "session/request_permission", params: { sessionId: "probe-session", toolCall: { toolCallId: "tool-1", title: "write" }, options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }] } })
    }
  } else if (message.method === "session/cancel" && pending !== undefined) {
    send({ jsonrpc: "2.0", id: pending, result: { stopReason: "cancelled" } })
    pending = undefined
  } else if (message.id === 99) {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "probe-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ cwd: globalThis.session.cwd, additionalDirectories: globalThis.session.additionalDirectories, mcpServers: globalThis.session.mcpServers, permission: message.result, pid: process.pid }) } } } })
    send({ jsonrpc: "2.0", id: active, result: { stopReason: "end_turn" } })
  }
})
`

const allowAlwaysAgent = agent.replace("kind: \"allow_once\"", "kind: \"allow_always\"")

const parallelAgent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
const pending = new Map()
let next = 0
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "parallel", version: "1" } } })
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "session-" + next++ } })
  } else if (message.method === "session/prompt") {
    const prompt = message.params.prompt[0].text
    if (prompt.includes("wait for cancellation")) {
      pending.set(message.params.sessionId, message.id)
    } else {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: message.params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ content: "second", stop: true }) } } } })
      send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
    }
  } else if (message.method === "session/cancel") {
    const id = pending.get(message.params.sessionId)
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, result: { stopReason: "cancelled" } })
      pending.delete(message.params.sessionId)
    }
  }
})
`

const continuationAgent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
let next = 0
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "continuation", version: "1" } } })
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "session-" + next++ } })
  } else if (message.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: message.params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ content: message.params.sessionId, stop: true }) } } } })
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
  }
})
`

const delayedContinuationAgent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
let next = 0
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "delayed", version: "1" } } })
  } else if (message.method === "session/new") {
    const sessionId = "session-" + next++
    setTimeout(() => send({ jsonrpc: "2.0", id: message.id, result: { sessionId } }), 25)
  } else if (message.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: message.params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ content: message.params.sessionId, stop: true }) } } } })
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
  }
})
`

const lateContinuationAgent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "late", version: "1" } } })
  } else if (message.method === "session/new") {
    setTimeout(() => send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "late-session" } }), 250)
  }
})
`

const blockedSessionAgent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "blocked-session", version: "1" } } })
  }
})
`

const uncooperativeAgent = String.raw`
import readline from "node:readline"
setInterval(() => {}, 1_000)
const lines = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "uncooperative", version: "1" } } })
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "uncooperative-session" } })
  }
})
`

const recoveringAgent = String.raw`
recovering
`

function managedConfig(source = agent, shutdownTimeoutMs = 5_000) {
  return codexAcpConfig({
    auth: { kind: "global" },
    command: process.execPath,
    args: ["--input-type=module", "--eval", source],
    cwd: process.cwd(),
    additionalDirectories: ["/tmp"],
    permission: "deny",
    shutdownTimeoutMs,
  })
}

it("passes explicit roots with no MCP servers and leaves no live state after close", async () => {
  const scope = createScope({ presets: [preset(spawnProcess, managedProcess(agent))], tags: [managedConfig()] })
  const ctx = scope.createContext({
    tags: [session.current.authority(testAuthority([process.cwd(), "/tmp"]))],
  })
  const boundary = await ctx.resolve(acp)
  const output = JSON.parse(await ctx.exec({ flow: codexAcpPrompt, input: request })) as {
    cwd: string
    additionalDirectories: string[]
    mcpServers: unknown[]
    permission: unknown
    pid: number
  }

  expect(output).toEqual({
    cwd: process.cwd(),
    additionalDirectories: ["/tmp"],
    mcpServers: [],
    permission: { outcome: { outcome: "cancelled" } },
    pid: output.pid,
  })
  await ctx.close()
  await scope.dispose()
  expect(boundary.sessions.size).toBe(0)
  expect(boundary.metadata.size).toBe(0)
  expect(() => process.kill(output.pid, 0)).toThrow()
})

it("cancels only the selected ACP attempt while an overlapping attempt completes", async () => {
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(parallelAgent))],
    tags: [managedConfig(parallelAgent)],
  })
  const cancelled = scope.createContext()
  const completed = scope.createContext()
  const first = cancelled.execStream({
    flow: codexAcpAttempt,
    input: { ...request, instructions: "wait for cancellation" },
    signal: controller.signal,
  })
  const second = completed.execStream({ flow: codexAcpAttempt, input: request })
  const firstEvents = collect(first).catch((error: unknown) => error)
  const secondEvents = collect(second)

  await new Promise<void>((resolve) => setTimeout(resolve, 25))
  controller.abort()

  await expect(first.result).rejects.toMatchObject({ name: "AbortError" })
  await expect(second.result).resolves.toMatchObject({ content: "second", stop: true })
  await expect(firstEvents).resolves.toMatchObject({ name: "AbortError" })
  expect(await secondEvents).toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: JSON.stringify({ content: "second", stop: true }) },
    { type: "provider_status", status: "completed" },
  ])

  await cancelled.close()
  await completed.close()
  await scope.dispose()
})

it("continues the same ACP session for the same SDK session and branch", async () => {
  const branch = branchRecord()
  const record = sessionRecord("sdk-session", branch)
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(continuationAgent))],
    tags: [
    managedConfig(continuationAgent),
    session.authority(branch.authority),
    session.record(record),
    session.clock({ now: () => new Date(0).toISOString() }),
    ],
  })
  const host = scope.createContext()
  const boundary = await host.resolve(acp)
  const runtime = await host.resolve(session.session)
  const executionTags = [session.current.branch(branch), session.current.session(runtime)]
  const invoke = async () => {
    const stream = host.execStream({ flow: codexAcpAttempt, input: request, tags: executionTags })
    await collect(stream)
    return stream.result
  }

  await expect(invoke()).resolves.toMatchObject({ content: "session-0", stop: true })
  await expect(invoke()).resolves.toMatchObject({ content: "session-0", stop: true })
  expect(boundary.continuations).toEqual(new Map([[continuationKey(record, branch), "session-0"]]))
  expect(runtime.record.providerContinuations).toEqual({ [continuationKey(record, branch)]: "session-0" })

  await host.close()
  await scope.dispose()
})

it("atomically reserves the first continuation for concurrent prompts", async () => {
  const branch = branchRecord()
  const record = sessionRecord("sdk-session", branch)
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(delayedContinuationAgent))],
    tags: [managedConfig(delayedContinuationAgent)],
  })
  const ctx = scope.createContext({ tags: [session.record(record), session.current.branch(branch)] })
  const boundary = await ctx.resolve(acp)
  const first = ctx.execStream({ flow: codexAcpAttempt, input: request })
  const second = ctx.execStream({ flow: codexAcpAttempt, input: request })
  const results = await Promise.allSettled([
    collect(first).then(() => first.result),
    collect(second).then(() => second.result),
  ])

  expect(results.filter((result) => result.status === "fulfilled")).toMatchObject([
    { value: { content: "session-0", stop: true } },
  ])
  expect(results.filter((result) => result.status === "rejected")).toMatchObject([
    { reason: { name: "CodexConcurrencyError" } },
  ])
  expect(boundary.continuations).toEqual(new Map([[continuationKey(record, branch), "session-0"]]))

  await ctx.close()
  await scope.dispose()
})

it("does not publish a late continuation after the session starts finishing", async () => {
  const controller = new AbortController()
  const branch = branchRecord()
  const record = sessionRecord("sdk-session", branch)
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(lateContinuationAgent))],
    tags: [
    managedConfig(lateContinuationAgent),
    session.authority(branch.authority),
    session.record(record),
    session.clock({ now: () => new Date(0).toISOString() }),
    ],
  })
  const host = scope.createContext()
  const boundary = await host.resolve(acp)
  const runtime = await host.resolve(session.session)
  const stream = host.execStream({
    flow: codexAcpAttempt,
    input: request,
    signal: controller.signal,
    tags: [session.current.branch(branch), session.current.session(runtime)],
  })
  const events = collect(stream).catch((error: unknown) => error)

  for (let attempt = 0; attempt < 100 && !boundary.continuations.has(continuationKey(record, branch)); attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  expect(boundary.continuations.get(continuationKey(record, branch))).toBeInstanceOf(Promise)
  controller.abort()
  await runtime.finishWith(async (_record, expectedVersion) => expectedVersion + 1)

  await expect(events).resolves.toMatchObject({ name: "AbortError" })
  await expect(stream.result).rejects.toMatchObject({ name: "AbortError" })
  await new Promise<void>((resolve) => setTimeout(resolve, 300))
  expect(boundary.continuations).toEqual(new Map())
  expect(runtime.record.providerContinuations).toEqual({})

  await host.close()
  await scope.dispose()
})

it("settles abort while session creation is blocked", async () => {
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(blockedSessionAgent))],
    tags: [managedConfig(blockedSessionAgent)],
  })
  const ctx = scope.createContext()
  await ctx.resolve(acp)
  const stream = ctx.execStream({ flow: codexAcpAttempt, input: request, signal: controller.signal })
  const events = collect(stream).catch((error: unknown) => error)

  await new Promise<void>((resolve) => setTimeout(resolve, 25))
  controller.abort()

  await expect(events).resolves.toMatchObject({ name: "AbortError" })
  await expect(stream.result).rejects.toMatchObject({ name: "AbortError" })
  await ctx.close()
  await scope.dispose()
})

it("bounds consumer-stop when the ACP agent ignores cancellation", async () => {
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(uncooperativeAgent))],
    tags: [managedConfig(uncooperativeAgent, 25)],
  })
  const ctx = scope.createContext()
  await ctx.resolve(acp)
  const stream = ctx.execStream({ flow: codexAcpAttempt, input: request })
  const iterator = stream[Symbol.asyncIterator]()

  await expect(iterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: "provider_status", status: "started" },
  })
  const result = stream.result.catch(() => undefined)
  await expect(iterator.return?.()).resolves.toMatchObject({ done: true })
  await result
  await ctx.close()
  await scope.dispose()
})

it("releases timed-out state and ignores late settlement after replacement", async () => {
  const lifecycle = createClock()
  const branch = branchRecord()
  const record = sessionRecord("sdk-session", branch)
  const scope = createScope({
    presets: [preset(clock, lifecycle.value), preset(spawnProcess, managedProcess(recoveringAgent))],
    tags: [
      managedConfig(recoveringAgent, 25),
      session.authority(branch.authority),
      session.record(record),
      session.clock({ now: () => new Date(0).toISOString() }),
    ],
  })
  const host = scope.createContext()
  const boundary = await host.resolve(acp)
  const runtime = await host.resolve(session.session)
  const executionTags = [session.current.branch(branch), session.current.session(runtime)]
  const stream = host.execStream({ flow: codexAcpAttempt, input: request, tags: executionTags })
  const iterator = stream[Symbol.asyncIterator]()

  await expect(iterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: "provider_status", status: "started" },
  })
  expect(runtime.record.providerContinuations).toEqual({ [continuationKey(record, branch)]: "recovering-session-0" })
  const result = stream.result.catch(() => undefined)
  const stopped = iterator.return?.()
  await lifecycle.pending(1)
  lifecycle.fire()
  await expect(stopped).resolves.toMatchObject({ done: true })
  await result

  expect(runtime.record.providerContinuations).toEqual({})
  expect(boundary.continuations).toEqual(new Map())
  expect(boundary.sessions).toEqual(new Map())
  expect(boundary.streams).toEqual(new Map())
  expect(boundary.metadata).toEqual(new Map())

  const replacementBoundary = await host.resolve(acp)
  expect(replacementBoundary).not.toBe(boundary)
  const replacement = host.execStream({ flow: codexAcpAttempt, input: request, tags: executionTags })
  const replacementIterator = replacement[Symbol.asyncIterator]()
  await expect(replacementIterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: "provider_status", status: "started" },
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(runtime.record.providerContinuations).toEqual({ [continuationKey(record, branch)]: "recovering-session-0" })
  expect(replacementBoundary.continuations).toEqual(new Map([
    [continuationKey(record, branch), "recovering-session-0"],
  ]))
  expect(replacementBoundary.sessions.has("recovering-session-0")).toBe(true)
  expect(replacementBoundary.streams.has("recovering-session-0")).toBe(true)
  expect(replacementBoundary.metadata.has("recovering-session-0")).toBe(true)

  const replacementResult = replacement.result.catch(() => undefined)
  const replacementStopped = replacementIterator.return?.()
  await lifecycle.pending(1)
  lifecycle.fire()
  await expect(replacementStopped).resolves.toMatchObject({ done: true })
  await replacementResult
  expect(runtime.record.providerContinuations).toEqual({})
  expect(replacementBoundary.continuations).toEqual(new Map())
  expect(replacementBoundary.sessions).toEqual(new Map())
  expect(replacementBoundary.streams).toEqual(new Map())
  expect(replacementBoundary.metadata).toEqual(new Map())

  await host.close()
  await scope.dispose()
})

it("normalizes ACP chunks and keeps correlation state scoped to the attempt", async () => {
  const scope = createScope({ presets: [preset(spawnProcess, managedProcess(agent))], tags: [managedConfig()] })
  const ctx = scope.createContext()
  const boundary = await ctx.resolve(acp)
  const stream = ctx.execStream({ flow: codexAcpAttempt, input: request })
  const normalized = []

  for await (const event of stream) normalized.push(event)

  expect(normalized[0]).toEqual({ type: "provider_status", status: "started" })
  expect(normalized.at(-1)).toEqual({ type: "provider_status", status: "completed" })
  expect(normalized.some((event) => event.type === "content_delta")).toBe(true)
  await expect(stream.result).resolves.toMatchObject({
    content: expect.stringContaining('"mcpServers":[]'),
    stop: true,
  })
  expect(boundary.sessions.size).toBe(0)
  expect(boundary.streams.size).toBe(0)
  expect(boundary.metadata.size).toBe(0)

  await ctx.close()
  await scope.dispose()
})

it("sends ACP cancellation from AbortSignal and settles correlation state", async () => {
  const controller = new AbortController()
  const scope = createScope({ presets: [preset(spawnProcess, managedProcess(agent))], tags: [managedConfig()] })
  const ctx = scope.createContext()
  const boundary = await ctx.resolve(acp)
  const prompt = ctx.exec({
    flow: codexAcpPrompt,
    input: { ...request, instructions: "wait for cancellation" },
    signal: controller.signal,
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 25))
  controller.abort()

  await expect(prompt).rejects.toMatchObject({ name: "AbortError" })
  expect(boundary.sessions.size).toBe(0)
  expect(boundary.metadata.size).toBe(0)
  await ctx.close()
  await scope.dispose()
})

it("bounds scalar ACP cancellation and releases local state when the agent does not settle", async () => {
  const lifecycle = createClock()
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(clock, lifecycle.value), preset(spawnProcess, managedProcess(uncooperativeAgent))],
    tags: [managedConfig(uncooperativeAgent, 25)],
  })
  const ctx = scope.createContext()
  const boundary = await ctx.resolve(acp)
  const prompt = ctx.exec({ flow: codexAcpPrompt, input: request, signal: controller.signal })
  while (boundary.sessions.size === 0) await new Promise((resolve) => setImmediate(resolve))

  controller.abort()
  await lifecycle.pending(1)
  expect(boundary.sessions).toEqual(new Map())
  expect(boundary.metadata).toEqual(new Map())
  lifecycle.fire()

  await expect(prompt).rejects.toMatchObject({ name: "AbortError" })
  await ctx.close()
  await scope.dispose()
})

it("rejects ACP roots outside current work authority before spawning", async () => {
  const lifecycle = createLifecycleHarness({ closeOnForce: true })
  const cwd = process.cwd()
  const config = managedConfig(agent)
  const authority = session.createAuthority({
    tenant: "codex-acp-test",
    roots: [cwd],
    permissions: [],
    tools: [],
    sandbox: { roots: [cwd], commands: [], write: false, network: false },
  })
  const scope = createScope({ presets: [preset(spawnProcess, lifecycle.spawn)], tags: [config] })
  const ctx = scope.createContext({ tags: [session.current.authority(authority)] })

  await expect(ctx.resolve(acp)).rejects.toThrow("ACP roots exceed current work authority")
  expect(lifecycle.starts).toBe(0)
  await ctx.close()
  await scope.dispose()
})

it("never selects an allow_always ACP permission", async () => {
  const cwd = process.cwd()
  const authority = session.createAuthority({
    tenant: "codex-acp-test",
    roots: [cwd],
    permissions: ["write"],
    tools: [],
    sandbox: { roots: [cwd], commands: [], write: true, network: true },
  })
  const scope = createScope({
    presets: [preset(spawnProcess, managedProcess(allowAlwaysAgent))],
    tags: [codexAcpConfig({
      auth: { kind: "global" },
      command: process.execPath,
      args: ["--input-type=module", "--eval", allowAlwaysAgent],
      cwd,
      additionalDirectories: [],
      permission: "grant",
      shutdownTimeoutMs: 5_000,
    })],
  })
  const ctx = scope.createContext({ tags: [session.current.authority(authority)] })
  const output = JSON.parse(await ctx.exec({ flow: codexAcpPrompt, input: request })) as { permission: unknown }

  expect(output.permission).toEqual({ outcome: { outcome: "cancelled" } })
  await ctx.close()
  await scope.dispose()
})

it("rejects an ACP directory that escapes authority through a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "pumped-acp-symlink-"))
  const allowed = join(root, "allowed")
  const outside = join(root, "outside")
  await mkdir(allowed)
  await mkdir(outside)
  const escape = join(allowed, "escape")
  await symlink(outside, escape, "dir")
  const scope = createScope({ tags: [codexAcpConfig({
    auth: { kind: "global" },
    cwd: allowed,
    additionalDirectories: [escape],
    permission: "deny",
    shutdownTimeoutMs: 10,
  })] })
  const ctx = scope.createContext({ tags: [session.current.authority(testAuthority([allowed]))] })

  await expect(ctx.resolve(acp)).rejects.toThrow("ACP roots exceed current work authority")

  await ctx.close()
  await scope.dispose()
  await rm(root, { recursive: true })
})

it.each([
  [false, true, "ACP write exceeds current work authority"],
  [true, false, "ACP network exceeds current work authority"],
] as const)("rejects ACP grant outside current work capabilities %#", async (write, network, message) => {
  const lifecycle = createLifecycleHarness({ closeOnForce: true })
  const cwd = process.cwd()
  const scope = createScope({
    presets: [preset(spawnProcess, lifecycle.spawn)],
    tags: [codexAcpConfig({
      auth: { kind: "global" },
      cwd,
      additionalDirectories: [],
      permission: "grant",
      shutdownTimeoutMs: 25,
    })],
  })
  const ctx = scope.createContext({ tags: [session.current.authority(testAuthority([cwd], write, network))] })

  await expect(ctx.resolve(acp)).rejects.toThrow(message)
  expect(lifecycle.starts).toBe(0)
  await ctx.close()
  await scope.dispose()
})

it.each([
  ["cwd", ".", [], "ACP cwd must be absolute"],
  ["additional directory", process.cwd(), ["relative"], "ACP additionalDirectories must be absolute"],
])("rejects a relative ACP %s before spawning", async (_label, cwd, additionalDirectories, message) => {
  const scope = createScope({
    tags: [codexAcpConfig({
      auth: { kind: "global" },
      cwd,
      additionalDirectories,
      permission: "deny",
      shutdownTimeoutMs: 5_000,
    })],
  })
  const ctx = scope.createContext()

  await expect(ctx.resolve(acp)).rejects.toThrow(message)
  await ctx.close()
  await scope.dispose()
})

it("fails dependency resolution without explicit ACP authority config", async () => {
  const scope = createScope()
  const ctx = scope.createContext()

  await expect(ctx.resolve(acp)).rejects.toThrow()
  await ctx.close()
  await scope.dispose()
})

it("fails closed without explicit ACP auth", async () => {
  const harness = createLifecycleHarness({ closeOnForce: true })
  const scope = createScope({
    presets: [preset(spawnProcess, harness.spawn)],
    tags: [codexAcpConfig({
      cwd: process.cwd(),
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 5_000,
    } as Parameters<typeof codexAcpConfig>[0])],
  })
  const ctx = scope.createContext()

  await expect(ctx.resolve(acp)).rejects.toThrow("ACP auth must be explicitly set")
  expect(harness.starts).toBe(0)
  await ctx.close()
  await scope.dispose()
})

it("declares API-key environment and escalates a stubborn child once", async () => {
  const harness = createLifecycleHarness({ closeOnForce: true })
  const timer = createClock()
  const inherited = { PATH: "/bin", MY_CODEX_KEY: "secret" }
  const scope = createScope({
    presets: [
      preset(spawnProcess, harness.spawn),
      preset(clock, timer.value),
      preset(environment, inherited),
    ],
    tags: [codexAcpConfig({
      auth: { kind: "api-key", env: "MY_CODEX_KEY" },
      cwd: process.cwd(),
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 10,
    })],
  })
  const ctx = scope.createContext()
  const boundary = await ctx.resolve(acp)

  expect(harness.spawnOptions?.env).toEqual({ PATH: "/bin", MY_CODEX_KEY: "secret", CODEX_API_KEY: "secret" })
  expect(harness.stderrFlowing).toBe(true)
  const close = ctx.close()
  await timer.pending(1)
  expect(harness.signals).toEqual(["SIGTERM"])
  timer.fire()
  await close
  await ctx.close()
  await scope.dispose()
  await scope.dispose()

  expect(harness.signals).toEqual(["SIGTERM", "SIGKILL"])
  expect(harness.closes).toBe(1)
  expect(harness.live).toBe(false)
  expect(boundary.sessions.size).toBe(0)
  expect(boundary.metadata.size).toBe(0)
})

it("rejects with a typed error after both shutdown bounds", async () => {
  const harness = createLifecycleHarness({ closeOnForce: false })
  const timer = createClock()
  const scope = createScope({
    presets: [preset(spawnProcess, harness.spawn), preset(clock, timer.value)],
    tags: [codexAcpConfig({
      auth: { kind: "global" },
      cwd: process.cwd(),
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 10,
    })],
  })
  const ctx = scope.createContext()
  const boundary = await ctx.resolve(acp)
  const close = ctx.close()

  await timer.pending(1)
  timer.fire()
  await timer.pending(1)
  timer.fire()
  await expect(close).rejects.toBeInstanceOf(CodexShutdownError)
  expect(harness.signals).toEqual(["SIGTERM", "SIGKILL"])
  expect(harness.live).toBe(true)
  expect(boundary.sessions.size).toBe(0)
  expect(boundary.metadata.size).toBe(0)
  await scope.dispose()
})

interface AcpMessage {
  readonly id?: number
  readonly method?: string
  readonly params?: {
    readonly sessionId?: string
    readonly cwd?: string
    readonly additionalDirectories?: string[]
    readonly mcpServers?: unknown[]
    readonly prompt?: Array<{ readonly text?: string }>
  }
  readonly result?: unknown
}

function managedProcess(source: string): Lite.Utils.AtomValue<typeof spawnProcess> {
  return ((_command: string, _args: readonly string[], _options: SpawnOptionsWithoutStdio) => {
    const input = new PassThrough()
    const output = new PassThrough()
    const error = new PassThrough()
    const pending = new Map<string, number>()
    let activePrompt: number | undefined
    let created = 0
    let buffered = ""
    let exitCode: number | null = null
    let sessionConfig: AcpMessage["params"]
    let stalePrompt: number | undefined
    const send = (message: unknown) => output.write(`${JSON.stringify(message)}\n`)
    const kind = source.includes("kind: \"allow_always\"")
      ? "allow-always"
      : source === parallelAgent
        ? "parallel"
        : source === continuationAgent
          ? "continuation"
          : source === delayedContinuationAgent
            ? "delayed"
            : source === lateContinuationAgent
              ? "late"
              : source === blockedSessionAgent
                ? "blocked"
                : source === recoveringAgent
                  ? "recovering"
                  : source === uncooperativeAgent
                    ? "uncooperative"
                    : "agent"
    const sessionId = () => kind === "agent" || kind === "allow-always"
      ? "probe-session"
      : kind === "uncooperative"
        ? "uncooperative-session"
        : kind === "recovering"
          ? `recovering-session-${created++}`
          : `session-${created++}`
    const respondSession = (message: AcpMessage, id: string) => send({
      jsonrpc: "2.0",
      id: message.id,
      result: { sessionId: id },
    })
    input.setEncoding("utf8")
    input.on("data", (chunk: string) => {
      buffered += chunk
      const lines = buffered.split("\n")
      buffered = lines.pop() ?? ""
      for (const line of lines) {
        const message = JSON.parse(line) as AcpMessage
        if (message.method === "initialize") {
          send({
            jsonrpc: "2.0",
            id: message.id,
            result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: kind, version: "1" } },
          })
        } else if (message.method === "session/new") {
          sessionConfig = message.params
          if (kind === "blocked") continue
          const id = kind === "late" ? "late-session" : sessionId()
          const delay = kind === "late" ? 250 : kind === "delayed" ? 25 : 0
          if (delay) setTimeout(() => respondSession(message, id), delay)
          else respondSession(message, id)
        } else if (message.method === "session/prompt") {
          const id = message.params?.sessionId ?? ""
          const text = message.params?.prompt?.[0]?.text ?? ""
          if (kind === "uncooperative") continue
          if (kind === "recovering") {
            if (stalePrompt === undefined) {
              stalePrompt = message.id
            } else {
              send({ jsonrpc: "2.0", id: stalePrompt, result: { stopReason: "cancelled" } })
              stalePrompt = undefined
            }
            continue
          }
          if (text.includes("wait for cancellation")) {
            if (message.id !== undefined) pending.set(id, message.id)
          } else if (kind === "agent" || kind === "allow-always") {
            activePrompt = message.id
            send({
              jsonrpc: "2.0",
              id: 99,
              method: "session/request_permission",
              params: {
                sessionId: id,
                toolCall: { toolCallId: "tool-1", title: "write" },
                options: [{ optionId: "allow", name: "Allow", kind: kind === "allow-always" ? "allow_always" : "allow_once" }],
              },
            })
          } else {
            const content = kind === "parallel" ? "second" : id
            send({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                sessionId: id,
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: JSON.stringify({ content, stop: true }) },
                },
              },
            })
            send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })
          }
        } else if (message.method === "session/cancel") {
          const id = message.params?.sessionId ?? ""
          const requestId = pending.get(id)
          if (requestId !== undefined) {
            send({ jsonrpc: "2.0", id: requestId, result: { stopReason: "cancelled" } })
            pending.delete(id)
          }
        } else if (message.id === 99 && activePrompt !== undefined) {
          send({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "probe-session",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: JSON.stringify({
                    cwd: sessionConfig?.cwd,
                    additionalDirectories: sessionConfig?.additionalDirectories,
                    mcpServers: sessionConfig?.mcpServers,
                    permission: message.result,
                    pid: 2_147_483_647,
                  }),
                },
              },
            },
          })
          send({ jsonrpc: "2.0", id: activePrompt, result: { stopReason: "end_turn" } })
          activePrompt = undefined
        }
      }
    })
    const child = Object.assign(new EventEmitter(), {
      stdin: input,
      stdout: output,
      stderr: error,
      kill() {
        if (exitCode !== null) return false
        exitCode = 0
        output.end()
        error.end()
        child.emit("close", 0, null)
        return true
      },
    }) as unknown as ChildProcessWithoutNullStreams
    Object.defineProperty(child, "exitCode", { get: () => exitCode })
    return child
  }) as Lite.Utils.AtomValue<typeof spawnProcess>
}

function createLifecycleHarness(options: { closeOnForce: boolean }) {
  const input = new PassThrough()
  const output = new PassThrough()
  const error = new PassThrough()
  const signals: NodeJS.Signals[] = []
  let starts = 0
  let closes = 0
  let live = true
  let buffered = ""
  let spawnOptions: SpawnOptionsWithoutStdio | undefined
  let exitCode: number | null = null
  input.setEncoding("utf8")
  input.on("data", (chunk: string) => {
    buffered += chunk
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    for (const line of lines) {
      const message = JSON.parse(line) as { id?: number; method?: string }
      if (message.method === "initialize") {
        output.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "fake", version: "1" } },
        })}\n`)
      }
    }
  })
  const child = Object.assign(new EventEmitter(), {
    stdin: input,
    stdout: output,
    stderr: error,
    kill(signal: NodeJS.Signals = "SIGTERM") {
      signals.push(signal)
      if (signal === "SIGKILL" && options.closeOnForce) close()
      return true
    },
  }) as unknown as ChildProcessWithoutNullStreams
  Object.defineProperty(child, "exitCode", { get: () => exitCode })
  const close = () => {
    if (!live) return
    live = false
    closes++
    exitCode = 0
    output.end()
    error.end()
    child.emit("close", 0, null)
  }
  const spawn = ((_command: string, _args: readonly string[], options: SpawnOptionsWithoutStdio) => {
    starts++
    spawnOptions = options
    return child
  }) as Lite.Utils.AtomValue<typeof spawnProcess>
  return {
    spawn,
    signals,
    get starts() {
      return starts
    },
    get closes() {
      return closes
    },
    get live() {
      return live
    },
    get spawnOptions() {
      return spawnOptions
    },
    get stderrFlowing() {
      return error.readableFlowing
    },
  }
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

function branchRecord(): session.BranchRecord {
  const authority = testAuthority()
  return {
    id: "main",
    version: 0,
    createdBy: "root",
    authorityFingerprint: authority.fingerprint,
    authority,
    evidence: [],
  }
}

function sessionRecord(id: string, branch: session.BranchRecord): session.SessionRecord {
  return {
    id,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: branch.authority.fingerprint,
    authorityConstraints: branch.authority,
    currentBranchId: branch.id,
    branches: [branch],
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

function continuationKey(record: session.SessionRecord, branch: session.BranchRecord): string {
  return `codex-acp:${record.id}:${branch.id}:${branch.authorityFingerprint}`
}

function testAuthority(roots: readonly string[] = [], write = false, network = false): session.Authority {
  return session.createAuthority({
    tenant: "test",
    roots,
    permissions: [],
    tools: [],
    sandbox: { roots, commands: [], write, network },
  })
}

function createClock() {
  const timers: Array<{ active: boolean; fn: () => void }> = []
  const value = {
    set(fn: () => void) {
      const timer = { active: true, fn }
      timers.push(timer)
      return timer as unknown as ReturnType<typeof setTimeout>
    },
    clear(target: ReturnType<typeof setTimeout>) {
      ;(target as unknown as { active: boolean }).active = false
    },
  } satisfies Lite.Utils.AtomValue<typeof clock>
  return {
    value,
    fire() {
      const timer = timers.find((candidate) => candidate.active)
      if (!timer) throw new Error("No pending shutdown timer")
      timer.active = false
      timer.fn()
    },
    async pending(count: number) {
      while (timers.filter((timer) => timer.active).length < count) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    },
  }
}
