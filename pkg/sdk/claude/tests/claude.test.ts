import { PassThrough } from "node:stream"
import { EventEmitter } from "node:events"
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process"
import { createScope, flow, preset, typed, type Lite } from "@pumped-fn/lite"
import { complete, model, type Model, type ModelRequest } from "@pumped-fn/sdk"
import * as session from "@pumped-fn/sdk/session"
import { expect, expectTypeOf, it } from "vitest"
import * as claudeModule from "../src/index"
import {
  claude,
  claudeAttempt,
  claudeConfig,
  claudeLeases,
  claudeRun,
  claudeSession,
  claudeTurn,
  clock,
  engine,
  ClaudeShutdownError,
  type ClaudeLeaseManager,
} from "../src/index"

const fake = flow({
  name: "claude.fake",
  parse: typed<ModelRequest>(),
  factory: async function* (ctx) {
    return { content: `provider=claude prompt=${ctx.input.agentName === "planner"}`, stop: true }
  },
})

const request: ModelRequest = {
  agentName: "planner",
  instructions: "Plan.",
  messages: [{ role: "user", content: "plan" }],
  tools: [],
  skills: [],
  loadedSkills: [],
  subagents: [],
  round: 0,
}

it("provides Claude through stable module handles", async () => {
  const scope = createScope({
    presets: [preset(claudeAttempt, fake)],
    tags: [claudeModule.provider, claudeModule.config(managedConfig())],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=claude prompt=true",
  })
  expectTypeOf(claudeModule.turn).toMatchTypeOf<Model>()

  await ctx.close()
  await scope.dispose()
})

it("can replace the model tag per context", async () => {
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    presets: [preset(claudeAttempt, fake)],
    tags: [claude, claudeConfig(managedConfig())],
  })
  const claudeCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(claudeCtx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=claude prompt=true",
  })
  await expect(fakeCtx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await claudeCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})

it("exposes aligned package-module handles without a facade", () => {
  expect(claudeModule.config).toBe(claudeConfig)
  expect(claudeModule.engine).toBe(engine)
  expect(claudeModule.run).toBe(claudeRun)
  expect(claudeModule.turn).toBe(claudeTurn)
  expect(claudeModule.provider).toBe(claude)
  expectTypeOf(claudeModule.engine).not.toBeAny()
})

it("exposes the canonical turn to attempt graph and retained scalar compatibility graph", () => {
  expect(claudeTurn.deps).toMatchObject({ attempt: { flow: claudeAttempt } })
  expect(claudeAttempt.deps).toMatchObject({ leases: claudeLeases })
  expect(claudeRun.deps).toMatchObject({ session: claudeSession })
  expect(claudeSession.deps).toMatchObject({ engine })
})

it("normalizes a managed lease stream and releases its transient process", async () => {
  const released: string[] = []
  const leases: ClaudeLeaseManager = {
    prompt: (sessionId) => ({
      events: (async function* () {
        yield { type: "provider_status", status: "started" } as const
        yield { type: "reasoning_delta", content: "check" } as const
        yield { type: "content_delta", content: "done" } as const
        yield { type: "provider_status", status: "completed" } as const
      })(),
      result: Promise.resolve(JSON.stringify({ content: "done", stop: true })),
    }),
    release: async (sessionId) => {
      released.push(sessionId)
    },
    transient: () => "transient-test",
  }
  const scope = createScope({ presets: [preset(claudeLeases, leases)] })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: claudeAttempt, input: {
    agentName: "planner",
    instructions: "Plan.",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  } })
  const normalized = []

  for await (const event of stream) normalized.push(event)

  expect(normalized).toEqual([
    { type: "provider_status", status: "started" },
    { type: "reasoning_delta", content: "check" },
    { type: "content_delta", content: "done" },
    { type: "provider_status", status: "completed" },
  ])
  await expect(stream.result).resolves.toEqual({ content: "done", stop: true })
  await expect(ctx.exec({ flow: claudeTurn, input: request })).resolves.toEqual({ content: "done", stop: true })
  expect(released).toEqual(["transient-test", "transient-test"])

  await ctx.close()
  await scope.dispose()
})

it("cancels a managed Claude lease when its stream consumer returns", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext({ tags: [session.record(sessionRecord("consumer"))] })
  const stream = ctx.execStream({ flow: claudeAttempt, input: request })
  const iterator = stream[Symbol.asyncIterator]()

  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: { type: "provider_status", status: "started" },
  })
  await harness.writes(1)
  const result = stream.result.catch(() => undefined)
  await expect(iterator.return?.()).resolves.toMatchObject({ done: true })
  await result
  expect(harness.signals).toEqual(["SIGINT"])
  expect(harness.live).toBe(false)

  await ctx.close()
  await scope.dispose()
})

it("releases only the aborted logical session lease", async () => {
  const controller = new AbortController()
  const released: string[] = []
  let start: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    start = resolve
  })
  const leases: ClaudeLeaseManager = {
    prompt: (sessionId, _prompt, signal) => sessionId === "blocked"
      ? {
          events: (async function* () {
            const aborted = new Promise<void>((_resolve, reject) => {
              signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
            })
            start()
            yield { type: "provider_status", status: "started" } as const
            await aborted
          })(),
          result: new Promise<string>(() => undefined),
        }
      : {
          events: (async function* () {
            yield { type: "provider_status", status: "started" } as const
            yield { type: "content_delta", content: "completed" } as const
            yield { type: "provider_status", status: "completed" } as const
          })(),
          result: Promise.resolve(JSON.stringify({ content: "completed", stop: true })),
        },
    release: async (sessionId) => {
      released.push(sessionId)
    },
    transient: () => "unused",
  }
  const scope = createScope({ presets: [preset(claudeLeases, leases)] })
  const blocked = scope.createContext({
    tags: [session.record(sessionRecord("blocked"))],
  })
  const completed = scope.createContext({ tags: [session.record(sessionRecord("completed"))] })
  const first = blocked.execStream({ flow: claudeAttempt, input: request, signal: controller.signal })
  const second = completed.execStream({ flow: claudeAttempt, input: request })
  const firstEvents = collect(first).catch((error: unknown) => error)
  const secondEvents = collect(second)

  await started
  controller.abort()

  await expect(first.result).rejects.toMatchObject({ name: "AbortError" })
  await expect(firstEvents).resolves.toMatchObject({ name: "AbortError" })
  await expect(second.result).resolves.toMatchObject({ content: "completed", stop: true })
  await expect(secondEvents).resolves.toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: "completed" },
    { type: "provider_status", status: "completed" },
  ])
  expect(released).toEqual(["blocked"])

  await blocked.close()
  await completed.close()
  await scope.dispose()
})

it("isolates managed leases by branch within one logical session", async () => {
  const controller = new AbortController()
  const released: string[] = []
  const prompted: string[] = []
  let start: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    start = resolve
  })
  const leases: ClaudeLeaseManager = {
    prompt: (sessionId, prompt, signal) => {
      prompted.push(sessionId)
      return prompt.includes("Agent: left")
        ? {
            events: (async function* () {
              const aborted = new Promise<void>((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
              })
              start()
              yield { type: "provider_status", status: "started" } as const
              await aborted
            })(),
            result: new Promise<string>(() => undefined),
          }
        : {
            events: (async function* () {
              yield { type: "provider_status", status: "started" } as const
              yield { type: "content_delta", content: "right" } as const
              yield { type: "provider_status", status: "completed" } as const
            })(),
            result: Promise.resolve(JSON.stringify({ content: "right", stop: true })),
          }
    },
    release: async (sessionId) => {
      released.push(sessionId)
    },
    transient: () => "unused",
  }
  const record = sessionRecord("shared")
  const authority = record.authorityConstraints
  const left = branchRecord("left", authority)
  const right = branchRecord("right", authority)
  const shared = { ...record, branches: [left, right], currentBranchId: left.id }
  const scope = createScope({ presets: [preset(claudeLeases, leases)] })
  const leftContext = scope.createContext({
    tags: [session.record(shared), session.current.branch(left)],
  })
  const rightContext = scope.createContext({
    tags: [session.record(shared), session.current.branch(right)],
  })
  const leftStream = leftContext.execStream({
    flow: claudeAttempt,
    input: { ...request, agentName: "left" },
    signal: controller.signal,
  })
  const rightStream = rightContext.execStream({ flow: claudeAttempt, input: { ...request, agentName: "right" } })
  const leftEvents = collect(leftStream).catch((error: unknown) => error)
  const rightEvents = collect(rightStream)

  await started
  controller.abort()

  await expect(leftStream.result).rejects.toMatchObject({ name: "AbortError" })
  await expect(leftEvents).resolves.toMatchObject({ name: "AbortError" })
  await expect(rightStream.result).resolves.toEqual({ content: "right", stop: true })
  await expect(rightEvents).resolves.toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: "right" },
    { type: "provider_status", status: "completed" },
  ])
  expect(prompted).toEqual(["shared:left", "shared:right"])
  expect(released).toEqual(["shared:left"])

  await leftContext.close()
  await rightContext.close()
  await scope.dispose()
})

it("runs sequential stream-json prompts through a scope-owned engine", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig({ roots: ["/tmp/extra"] }))],
  })
  const ctx = scope.createContext()

  const first = ctx.exec({ flow: claudeRun, input: { prompt: "first" } })
  const second = ctx.exec({ flow: claudeRun, input: { prompt: "second" } })
  await harness.writes(1)
  expect(harness.prompts).toEqual(["first"])

  harness.result("one")
  await expect(first).resolves.toBe("one")
  await harness.writes(2)
  expect(harness.prompts).toEqual(["first", "second"])

  harness.result("two")
  await expect(second).resolves.toBe("two")
  expect(harness.options).toMatchObject({ cwd: process.cwd() })
  expect(harness.options?.args).toEqual(expect.arrayContaining([
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--tools",
    "",
    "--permission-mode",
    "dontAsk",
    "--add-dir",
    "/tmp/extra",
  ]))

  await ctx.close()
  await scope.dispose()
  expect(harness.ends).toBe(1)
  expect(harness.live).toBe(false)
})

it("poisons a managed lease before child failure settles queued prompts", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  const leases = await ctx.resolve(claudeLeases)
  const first = leases.prompt("shared", "first")
  const queued = leases.prompt("shared", "must-not-start")
  await harness.writes(1)

  harness.fail(new Error("Claude child failed"))

  await expect(first.result).rejects.toThrow("Claude child failed")
  await expect(queued.result).rejects.toThrow("Claude session is closed")
  expect(harness.prompts).toEqual(["first"])
  await ctx.close()
  await scope.dispose()
})

it("interrupts an active prompt and awaits child close", async () => {
  const harness = createHarness({ closeOnEnd: false, closeOnInterrupt: false })
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  const prompt = ctx.exec({ flow: claudeRun, input: { prompt: "wait" }, signal: controller.signal })
  const queued = ctx.exec({ flow: claudeRun, input: { prompt: "must-not-start" }, signal: controller.signal })
  await harness.writes(1)

  controller.abort()
  await expect(prompt).rejects.toMatchObject({ name: "AbortError" })
  await expect(queued).rejects.toThrow("Claude session is closed")
  expect(harness.interrupts).toBe(1)
  expect(harness.prompts).toEqual(["wait"])

  let closed = false
  const close = ctx.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  harness.close()
  await close
  await ctx.close()
  await scope.dispose()
  expect(harness.live).toBe(false)
})

it("requires config through the graph before the engine starts", async () => {
  const harness = createHarness()
  const scope = createScope({ presets: [preset(engine, harness.engine)] })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: claudeRun, input: { prompt: "blocked" } })).rejects.toThrow()
  expect(harness.options).toBeUndefined()

  await ctx.close()
  await scope.dispose()
})

it.each([
  [{ auth: { kind: "global" }, cwd: process.cwd(), roots: ["relative"], permission: "deny", shutdownTimeoutMs: 25 }, "roots must contain only absolute paths"],
  [{ auth: { kind: "global" }, cwd: "relative", roots: [], permission: "deny", shutdownTimeoutMs: 25 }, "cwd must be an absolute path"],
] as const)("fails closed on incomplete managed authority %#", async (value, message) => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(value)],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: claudeRun, input: { prompt: "blocked" } })).rejects.toThrow(message)
  expect(harness.options).toBeUndefined()

  await ctx.close()
  await scope.dispose()
})

it("requires a positive shutdown bound before the engine starts", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig({ shutdownTimeoutMs: 0 }))],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: claudeRun, input: { prompt: "blocked" } })).rejects.toThrow("shutdownTimeoutMs must be greater than zero")
  expect(harness.options).toBeUndefined()

  await ctx.close()
  await scope.dispose()
})

it("escalates graceful close to SIGKILL within the second bound", async () => {
  const harness = createHarness({ closeOnEnd: false, closeOnSignals: ["SIGKILL"] })
  const timers = createClock()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  await ctx.resolve(claudeSession)

  const close = ctx.close()
  await new Promise((resolve) => setImmediate(resolve))
  expect(harness.ends).toBe(1)
  await timers.advance()
  expect(harness.signals).toEqual(["SIGKILL"])
  await close
  await scope.dispose()
  expect(harness.live).toBe(false)
})

it("fails closed when the child ignores SIGKILL past the second bound", async () => {
  const harness = createHarness({ closeOnEnd: false, closeOnSignals: [] })
  const timers = createClock()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  await ctx.resolve(claudeSession)

  const close = ctx.close()
  const rejected = expect(close).rejects.toBeInstanceOf(ClaudeShutdownError)
  await new Promise((resolve) => setImmediate(resolve))
  await timers.advance()
  await timers.advance()
  await rejected
  expect(harness.live).toBe(true)
  expect(harness.ends).toBe(1)
  expect(harness.signals).toEqual(["SIGKILL"])
  harness.close()
  await scope.dispose()
})

it("terminates exactly once across repeated context close and scope dispose", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  await ctx.resolve(claudeSession)

  await ctx.close()
  await ctx.close()
  await scope.dispose()
  await scope.dispose()
  expect(harness.ends).toBe(1)
  expect(harness.signals).toEqual([])
})

function managedConfig(overrides: Partial<Parameters<typeof claudeConfig>[0]> = {}): Parameters<typeof claudeConfig>[0] {
  return {
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 25,
    ...overrides,
  }
}

function createHarness(options: { closeOnEnd?: boolean; closeOnInterrupt?: boolean; closeOnSignals?: NodeJS.Signals[] } = {}) {
  const input = new PassThrough()
  const output = new PassThrough()
  const error = new PassThrough()
  const prompts: string[] = []
  let spawned: { command: string; args: readonly string[]; cwd: string | URL | undefined } | undefined
  const signals: NodeJS.Signals[] = []
  let ends = 0
  let live = true
  let buffered = ""
  input.setEncoding("utf8")
  input.on("data", (chunk: string) => {
    buffered += chunk
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    for (const line of lines) {
      const message = JSON.parse(line) as { message: { content: string } }
      prompts.push(message.message.content)
    }
  })
  const close = () => {
    if (!live) return
    live = false
    output.end()
    error.end()
    child.emit("close", 0, null)
  }
  const child = Object.assign(new EventEmitter(), {
    stdin: input,
    stdout: output,
    stderr: error,
    kill: (signal: NodeJS.Signals = "SIGTERM") => {
      signals.push(signal)
      const configured = options.closeOnSignals ?? (options.closeOnInterrupt === false ? [] : ["SIGINT", "SIGTERM", "SIGKILL"])
      if (configured.includes(signal)) close()
      return true
    },
  }) as unknown as ChildProcessWithoutNullStreams
  input.on("finish", () => {
    ends++
    if (options.closeOnEnd !== false) close()
  })
  const replacement = ((command: string, args: readonly string[], spawnOptions: SpawnOptionsWithoutStdio) => {
    spawned = { command, args, cwd: spawnOptions.cwd }
    return child
  }) as Lite.Utils.AtomValue<typeof engine>
  return {
    engine: replacement,
    prompts,
    result(value: string) {
      output.write(`${JSON.stringify({ type: "result", result: value, is_error: false })}\n`)
    },
    fail(reason: Error) {
      if (!live) return
      live = false
      child.emit("error", reason)
    },
    close,
    async writes(count: number) {
      while (prompts.length < count) await new Promise((resolve) => setImmediate(resolve))
    },
    get options() {
      return spawned
    },
    get interrupts() {
      return signals.filter((signal) => signal === "SIGINT").length
    },
    get signals() {
      return signals
    },
    get ends() {
      return ends
    },
    get live() {
      return live
    },
  }
}

function createClock() {
  let next = 0
  const timers = new Map<number, () => void>()
  const replacement: Lite.Utils.AtomValue<typeof clock> = {
    set(fn) {
      const token = next++
      timers.set(token, fn)
      return token
    },
    clear(token) {
      timers.delete(token)
    },
  }
  return {
    clock: replacement,
    async advance() {
      const entry = timers.entries().next().value
      if (!entry) throw new Error("No pending lifecycle bound")
      timers.delete(entry[0])
      entry[1]()
      await new Promise((resolve) => setImmediate(resolve))
    },
  }
}

function testAuthority(): session.Authority {
  return session.createAuthority({
    tenant: "test",
    roots: [],
    permissions: [],
    tools: [],
    sandbox: { roots: [], commands: [], write: false, network: false },
  })
}

function branchRecord(id = "main", authority = testAuthority()): session.BranchRecord {
  return {
    id,
    version: 0,
    createdBy: "root",
    authorityFingerprint: authority.fingerprint,
    authority,
    evidence: [],
  }
}

function sessionRecord(id: string): session.SessionRecord {
  const branch = branchRecord()
  const authority = branch.authority
  return {
    id,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
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

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}
