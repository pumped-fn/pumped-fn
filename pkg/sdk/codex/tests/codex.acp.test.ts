import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process"
import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { abortSignal, type ModelRequest } from "@pumped-fn/sdk"
import { expect, it } from "vitest"
import {
  acp,
  clock,
  CodexShutdownError,
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

function managedConfig() {
  return codexAcpConfig({
    auth: { kind: "global" },
    command: process.execPath,
    args: ["--input-type=module", "--eval", agent],
    cwd: process.cwd(),
    additionalDirectories: ["/tmp"],
    permission: "deny",
    shutdownTimeoutMs: 5_000,
  })
}

it("passes explicit roots with no MCP servers and leaves no live state after close", async () => {
  const scope = createScope({ tags: [managedConfig()] })
  const ctx = scope.createContext()
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

it("sends ACP cancellation from AbortSignal and settles correlation state", async () => {
  const controller = new AbortController()
  const scope = createScope({ tags: [managedConfig()] })
  const ctx = scope.createContext({ tags: [abortSignal(controller.signal)] })
  const boundary = await ctx.resolve(acp)
  const prompt = ctx.exec({
    flow: codexAcpPrompt,
    input: { ...request, instructions: "wait for cancellation" },
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 25))
  controller.abort()

  await expect(prompt).resolves.toBe("")
  expect(boundary.sessions.size).toBe(0)
  expect(boundary.metadata.size).toBe(0)
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
